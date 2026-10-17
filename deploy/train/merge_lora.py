#!/usr/bin/env python3
"""Mescla o adapter LoRA no modelo base — pré-requisito do GGUF via llama.cpp.

Roda no container icewall-quant (torch + transformers + peft). O modelo
mesclado sai em {--out} em bf16/f32, pronto para convert_hf_to_gguf.py.
"""

import argparse


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--base", required=True, help="modelo base (HF id ou caminho)")
    p.add_argument("--adapter", required=True, help="diretório do adapter peft")
    p.add_argument("--out", required=True)
    p.add_argument("--bf16", action="store_true")
    a = p.parse_args()

    import torch
    from peft import PeftModel
    from transformers import AutoModelForCausalLM, AutoTokenizer

    dtype = torch.bfloat16 if a.bf16 and torch.cuda.is_available() else torch.float32
    model = AutoModelForCausalLM.from_pretrained(a.base, torch_dtype=dtype)
    model = PeftModel.from_pretrained(model, a.adapter)
    model = model.merge_and_unload()
    model.save_pretrained(a.out)
    AutoTokenizer.from_pretrained(a.base).save_pretrained(a.out)
    print(f"merge ok: {a.out}")


if __name__ == "__main__":
    main()
