#!/usr/bin/env python3
# Bench para API OpenAI-compatível (vLLM). Mesmos cenários do bench.py (Ollama): prompts RAG ~6k tokens distintos.
# Uso: bench_oai.py --port 8000 --model M --conc 1 4 7 10 [--bg-port 8001 --bg-model M2 --bg-secs 120]
import argparse, json, threading, time, urllib.request, statistics as st, os

PRD = open(os.path.expanduser("~/glis-bench/PRD.md"), encoding="utf-8").read()


def chat(port, model, user, predict):
    body = {"model": model, "stream": True, "stream_options": {"include_usage": True}, "max_tokens": predict, "temperature": 0.2,
            "messages": [{"role": "user", "content": user}], "chat_template_kwargs": {"enable_thinking": False}}
    req = urllib.request.Request(f"http://127.0.0.1:{port}/v1/chat/completions", json.dumps(body).encode(), {"Content-Type": "application/json"})
    t0 = time.time(); tf = None; usage = {}
    with urllib.request.urlopen(req, timeout=900) as r:
        for raw in r:
            raw = raw.strip()
            if not raw.startswith(b"data:") or raw.endswith(b"[DONE]"): continue
            d = json.loads(raw[5:])
            if d.get("usage"): usage = d["usage"]
            ch = d.get("choices") or []
            if tf is None and ch and (ch[0]["delta"].get("content") or ch[0]["delta"].get("reasoning_content") or ch[0]["delta"].get("reasoning")):
                tf = time.time()
    te = time.time(); out = usage.get("completion_tokens", 0)
    return dict(ttft=(tf or te) - t0, out=out, dec_tps=(out - 1) / (te - tf) if tf and te > tf and out > 1 else 0, prompt=usage.get("prompt_tokens", 0))


def prompt(i, chars):
    off = (i * 7919) % max(1, len(PRD) - chars)
    return (f"Use SOMENTE o trecho abaixo (id {i}-{time.time_ns()}).\n\n{PRD[off:off+chars]}\n\n"
            "Pergunta: resuma em 5 tópicos os requisitos de desempenho mencionados, em português.")


def level(port, model, n, chars, predict):
    res = [None] * n; err = []
    def w(i):
        try: res[i] = chat(port, model, prompt(i, chars), predict)
        except Exception as e: err.append(repr(e)[:120])
    t0 = time.time(); th = [threading.Thread(target=w, args=(i,)) for i in range(n)]
    [t.start() for t in th]; [t.join() for t in th]; wall = time.time() - t0
    ok = [r for r in res if r]
    if not ok: return dict(conc=n, erros=err)
    tt = sorted(r["ttft"] for r in ok)
    return dict(conc=n, ok=len(ok), erros=len(err), wall=round(wall, 1), prompt_med=int(st.median(r["prompt"] for r in ok)),
                ttft_med=round(st.median(tt), 1), ttft_p95=round(tt[min(len(tt) - 1, int(len(tt) * .95))], 1), ttft_max=round(tt[-1], 1),
                dec_tps_por_req=round(st.mean(r["dec_tps"] for r in ok), 1), dec_tps_agregado=round(sum(r["out"] for r in ok) / wall, 1))


def bg(port, model, secs, stop, out):
    rates = []; t0 = time.time()
    while not stop.is_set() and time.time() - t0 < secs:
        try: rates.append(chat(port, model, "Escreva um programa Python longo que implemente uma fila com testes. Explique cada função.", 400)["dec_tps"])
        except Exception as e: out["erro"] = repr(e)[:120]; break
    out["rates"] = rates


if __name__ == "__main__":
    a = argparse.ArgumentParser()
    a.add_argument("--port", type=int, default=8000); a.add_argument("--model", required=True)
    a.add_argument("--conc", type=int, nargs="+", default=[1]); a.add_argument("--ctx-chars", type=int, default=20000)
    a.add_argument("--predict", type=int, default=200)
    a.add_argument("--bg-port", type=int); a.add_argument("--bg-model"); a.add_argument("--bg-secs", type=int, default=600)
    a = a.parse_args()
    chat(a.port, a.model, "Diga olá.", 5)
    stop = threading.Event(); b = {}; bt = None
    if a.bg_model:
        chat(a.bg_port, a.bg_model, "Diga olá.", 5)
        bt = threading.Thread(target=bg, args=(a.bg_port, a.bg_model, a.bg_secs, stop, b)); bt.start(); time.sleep(8)
    for n in a.conc: print(json.dumps(level(a.port, a.model, n, a.ctx_chars, a.predict), ensure_ascii=False), flush=True)
    if bt:
        stop.set(); bt.join(); r = b.get("rates", [])
        print(json.dumps(dict(bg_model=a.bg_model, bg_reqs=len(r), bg_dec_tps_med=round(st.median(r), 1) if r else None, bg_erro=b.get("erro")), ensure_ascii=False))
