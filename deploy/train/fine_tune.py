#!/usr/bin/env python3
"""
Fine-tune LoRA/QLoRA do ICEWALL — roda dentro do container `icewall-train`
(derivado da imagem vLLM: torch + transformers + peft + datasets).

Protocolo de log consumido pelo painel (linhas em stdout/train.log):

    @@ICW {"type":"start","total_steps":N,"total_epochs":E}@@
    @@ICW {"type":"step","step":N,"loss":L,"lr":X,"epoch":E}@@
    @@ICW {"type":"done","train_loss":L}@@
    @@ICW {"type":"error","message":"..."}@@

Toda outra linha é log humano (Trainer/stack), guardado no train.log.
O adapter resultante fica em {--out}/adapter (peft save_pretrained).
"""

import argparse
import json
import sys


def emit(payload: dict) -> None:
    print(f"@@ICW {json.dumps(payload)}@@", flush=True)


def emit_error(message: str) -> None:
    emit({"type": "error", "message": message[:500]})


def parse_args():
    p = argparse.ArgumentParser(description="Fine-tune LoRA do ICEWALL")
    p.add_argument("--model", required=True, help="HF hub id ou caminho local")
    p.add_argument("--dataset", required=True, help="JSONL ({messages}|{text}) dentro do container")
    p.add_argument("--out", default="/workspace/out")
    p.add_argument("--epochs", type=int, default=3)
    p.add_argument("--lr", type=float, default=2e-4)
    p.add_argument("--batch-size", type=int, default=2)
    p.add_argument("--grad-accum", type=int, default=4)
    p.add_argument("--max-seq-len", type=int, default=2048)
    p.add_argument("--max-samples", type=int, default=None)
    p.add_argument("--r", type=int, default=16)
    p.add_argument("--alpha", type=int, default=16)
    p.add_argument("--dropout", type=float, default=0.0)
    p.add_argument("--target-modules", default="q_proj,k_proj,v_proj,o_proj")
    p.add_argument("--qlora", action="store_true", help="LoRA em 4-bit (bitsandbytes); cai para bf16 se indisponível")
    p.add_argument("--full", action="store_true", help="fine-tune completo (sem LoRA)")
    p.add_argument("--bf16", action="store_true")
    p.add_argument("--logging-steps", type=int, default=5)
    p.add_argument("--seed", type=int, default=3407)
    return p.parse_args()


def carregar_textos(dataset_path: str, tokenizer, max_samples):
    """Cada linha do JSONL vira um texto: messages via chat template, ou {text}."""
    from datasets import load_dataset

    ds = load_dataset("json", data_files=dataset_path, split="train")
    if max_samples:
        ds = ds.select(range(min(max_samples, len(ds))))

    def para_texto(ex):
        try:
            d = dict(ex)  # LazyRow → dict (datasets novos entrega LazyRow no map)
        except Exception:
            d = {"text": str(ex)}
        msgs = d.get("messages")
        if msgs:
            try:
                return {"text": tokenizer.apply_chat_template(msgs, tokenize=False)}
            except Exception:
                # Modelo sem chat template: junta as mensagens na mão
                linhas = []
                for m in msgs:
                    papel = m.get("role", "user") if isinstance(m, dict) else "user"
                    conteudo = m.get("content", "") if isinstance(m, dict) else str(m)
                    linhas.append(f"{papel}: {conteudo}")
                return {"text": "\n".join(linhas)}
        if d.get("text"):
            return {"text": d["text"]}
        return {"text": json.dumps(d, ensure_ascii=False, default=str)}

    return ds.map(para_texto)


def main():
    args = parse_args()
    try:
        from datasets import load_dataset  # noqa: F401 (valida deps cedo)
        import torch
        from peft import LoraConfig, get_peft_model
        from transformers import (
            AutoModelForCausalLM,
            AutoTokenizer,
            DataCollatorForLanguageModeling,
            Trainer,
            TrainingArguments,
        )

        from transformers import TrainerCallback

        class IcwCallback(TrainerCallback):
            def on_train_begin(self, targs, tstate, tcontrol=None, **kw):
                emit({"type": "start", "total_steps": tstate.max_steps, "total_epochs": float(targs.num_train_epochs or 0)})

            def on_log(self, targs, tstate, tcontrol, logs=None, **kw):
                if logs and logs.get("loss") is not None:
                    emit({
                        "type": "step",
                        "step": int(tstate.global_step),
                        "loss": round(float(logs["loss"]), 6),
                        "lr": float(logs.get("learning_rate", 0.0) or 0.0),
                        "epoch": round(float(tstate.epoch or 0.0), 4),
                    })

            def on_train_end(self, targs, tstate, tcontrol=None, **kw):
                loss = getattr(tstate, "best_metric", None) or getattr(tstate, "log_history", [{}])[-1].get("train_loss")
                emit({"type": "done", "train_loss": round(float(loss), 6) if loss is not None else None})

        tokenizer = AutoTokenizer.from_pretrained(args.model)
        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token

        ds = carregar_textos(args.dataset, tokenizer, args.max_samples)
        if len(ds) == 0:
            raise ValueError("dataset vazio depois da conversão")

        def tokenizar(ex):
            return tokenizer(ex["text"], truncation=True, max_length=args.max_seq_len)

        ds = ds.map(tokenizar, remove_columns=ds.column_names, desc="tokenizando")

        dtype = torch.bfloat16 if args.bf16 and torch.cuda.is_available() else torch.float32
        load_kwargs = {"torch_dtype": dtype}

        if args.qlora and not args.full:
            try:
                from transformers import BitsAndBytesConfig

                load_kwargs["quantization_config"] = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_compute_dtype=dtype)
                load_kwargs["device_map"] = "auto"
            except Exception as err:
                emit({"type": "warning", "message": f"bitsandbytes indisponível ({err}); seguindo em bf16"})

        model = AutoModelForCausalLM.from_pretrained(args.model, **load_kwargs)

        if not args.full:
            lora = LoraConfig(
                r=args.r,
                lora_alpha=args.alpha,
                lora_dropout=args.dropout,
                target_modules=[m.strip() for m in args.target_modules.split(",") if m.strip()],
                bias="none",
                task_type="CAUSAL_LM",
            )
            model = get_peft_model(model, lora)
            model.print_trainable_parameters()

        targs = TrainingArguments(
            output_dir=args.out,
            per_device_train_batch_size=args.batch_size,
            gradient_accumulation_steps=args.grad_accum,
            learning_rate=args.lr,
            num_train_epochs=args.epochs,
            logging_steps=args.logging_steps,
            save_strategy="no",
            bf16=bool(args.bf16 and torch.cuda.is_available()),
            report_to=[],
            seed=args.seed,
            lr_scheduler_type="linear",
            warmup_steps=5,
            max_grad_norm=1.0,
            remove_unused_columns=False,
        )

        trainer = Trainer(
            model=model,
            args=targs,
            train_dataset=ds,
            data_collator=DataCollatorForLanguageModeling(tokenizer, mlm=False),
            callbacks=[IcwCallback()],
        )
        trainer.train()

        adapter_dir = f"{args.out.rstrip('/')}/adapter"
        model.save_pretrained(adapter_dir)
        tokenizer.save_pretrained(adapter_dir)
        emit({"type": "saved", "adapter": adapter_dir})
    except Exception as err:  # noqa: BLE001 — o painel precisa do erro no protocolo
        emit_error(f"{type(err).__name__}: {err}")
        sys.exit(1)


if __name__ == "__main__":
    main()
