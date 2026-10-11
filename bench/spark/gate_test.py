#!/usr/bin/env python3
# A/B do gate: agente 27B gerando continuamente + 3 rajadas de chat (7 sessões RAG ~6k) a cada ~25 s.
# Uso: gate_test.py [rotulo] [bursts]
import json, sys, threading, time, statistics as st
sys.path.insert(0, ".")
import bench_oai as b

label = sys.argv[1] if len(sys.argv) > 1 else "x"; BURSTS = int(sys.argv[2]) if len(sys.argv) > 2 else 3
stop = threading.Event(); done = []  # (t_fim, tokens, dur)


def agent():
    while not stop.is_set():
        t0 = time.time()
        try:
            r = b.chat(8001, "code", "Escreva um programa Python longo que implemente uma fila com testes. Explique cada função.", 400)
            done.append((time.time(), r["out"], time.time() - t0))
        except Exception as e:
            done.append((time.time(), 0, -1)); time.sleep(1)


t = threading.Thread(target=agent); t.start()
T0 = time.time(); time.sleep(10)
res = []
for i in range(BURSTS):
    r = b.level(8000, "chat", 7, 20000, 200); res.append(r); print(json.dumps(r), flush=True)
    time.sleep(25)
stop.set(); t.join(timeout=120); T = time.time() - T0
toks = sum(d[1] for d in done); lat = [d[2] for d in done if d[2] > 0]
print(json.dumps(dict(rotulo=label, chat_ttft_med=round(st.median(r["ttft_med"] for r in res), 1), chat_ttft_max=max(r["ttft_max"] for r in res),
                      chat_dec_por_req=round(st.mean(r["dec_tps_por_req"] for r in res), 1), agente_tokens=toks, janela_s=round(T),
                      agente_tok_s_medio=round(toks / T, 1), agente_pedidos=len(done), agente_lat_max_s=round(max(lat), 1) if lat else None,
                      agente_lat_med_s=round(st.median(lat), 1) if lat else None)))
