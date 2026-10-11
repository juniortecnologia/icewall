#!/usr/bin/env python3
# Soak da configuração final: chat (rajadas 7/10) + agente 27B (sob gate externo) + imagens + RAG. Uso: soak.py SEGUNDOS
import json, sys, threading, time, statistics as st
sys.path.insert(0, ".")
import bench_oai as b
import stress as s
import os, re, urllib.request
GATE_IMG = os.environ.get('GATE_IMG') == '1'

def chat_busy():
    m = urllib.request.urlopen('http://127.0.0.1:8000/metrics', timeout=2).read().decode()
    return sum(float(x) for x in re.findall(r'^vllm:num_requests_(?:running|waiting)\{[^}]*\} ([0-9.]+)', m, re.M)) > 0

DUR = int(sys.argv[1]) if len(sys.argv) > 1 else 600
stop = threading.Event(); ag = []; imgs = []; rag = []; bursts = []; errs = []


def agent():
    while not stop.is_set():
        t0 = time.time()
        try:
            r = b.chat(8001, "code", "Escreva um programa Python longo que implemente uma fila com testes. Explique cada função.", 400)
            ag.append((r["out"], time.time() - t0))
        except Exception as e:
            errs.append("agente:" + repr(e)[:80]); time.sleep(2)


def imagens():
    while not stop.is_set():
        w0 = time.time()
        if GATE_IMG:
            while chat_busy() and not stop.is_set(): time.sleep(0.2)
        esp = time.time() - w0
        r = s.gen(); r['espera'] = round(esp, 1); imgs.append(r)
        if r.get("erro"): errs.append("img:" + str(r["erro"])[:80])
        stop.wait(30)


def ragloop():
    import urllib.request
    docs = ["O prazo de troca por defeito é de 90 dias." * 3] * 20
    while not stop.is_set():
        s0 = time.time()
        try:
            for port, path, body in ((8002, "/v1/embeddings", {"model": "embed", "input": ["Qual o prazo de troca?"] * 8}),
                                     (8003, "/rerank", {"model": "rerank", "query": "prazo de troca", "documents": docs})):
                urllib.request.urlopen(urllib.request.Request(f"http://127.0.0.1:{port}{path}", json.dumps(body).encode(), {"Content-Type": "application/json"}), timeout=60).read()
            rag.append(time.time() - s0)
        except Exception as e:
            errs.append("rag:" + repr(e)[:80])
        stop.wait(2)


ths = [threading.Thread(target=f) for f in (agent, imagens, ragloop)]
[t.start() for t in ths]
T0 = time.time(); k = 0
while time.time() - T0 < DUR:
    n = 10 if k % 3 == 2 else 7; k += 1
    r = b.level(8000, "chat", n, 20000, 200); bursts.append(r)
    if r.get("erros"): errs.append(f"chat:{r['erros']}")
    time.sleep(20)
stop.set(); [t.join(timeout=120) for t in ths]
tt = [r["ttft_med"] for r in bursts if "ttft_med" in r]; mx = [r["ttft_max"] for r in bursts if "ttft_max" in r]
print(json.dumps(dict(duracao_s=round(time.time() - T0), rajadas=len(bursts), chat_ttft_med=round(st.median(tt), 1), chat_ttft_p95_das_medianas=round(sorted(tt)[int(len(tt) * .95)] if len(tt) > 1 else tt[0], 1),
                      chat_ttft_max=max(mx), chat_dec_por_req=round(st.mean(r["dec_tps_por_req"] for r in bursts if "ttft_med" in r), 1),
                      agente_pedidos=len(ag), agente_tok_s=round(sum(a[0] for a in ag) / (time.time() - T0), 1),
                      imagens=len(imgs), imagens_ok=sum(1 for i in imgs if i.get("ok")), img_seg_med=round(st.median(i["seg"] for i in imgs if i.get("seg")), 1), img_espera_med=round(st.median(i.get("espera", 0) for i in imgs), 1), img_espera_max=max(i.get("espera", 0) for i in imgs),
                      rag_ciclos=len(rag), rag_med_s=round(st.median(rag), 2), rag_max_s=round(max(rag), 2), erros=errs[:10], n_erros=len(errs)), ensure_ascii=False))
