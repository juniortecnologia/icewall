#!/usr/bin/env python3
# Carga realista do chat: N pessoas ativas, cada uma manda uma pergunta RAG (~6k tokens) a cada MIN–MAX s, em horários
# sorteados (semente fixa). É o critério do RNF-01; a rajada (bench_oai.py, todos no mesmo segundo) fica como pior caso.
# Opcional ao fundo: agente de código gerando sem parar, imagens em fila (uma por vez) e embed/rerank.
# Uso: carga_real.py [--users 7] [--dur 300] [--min 20] [--max 40] [--predict 400] [--code] [--img PAUSA_S] [--gate-img] [--rag]
import argparse, json, random, re, threading, time, statistics as st, urllib.request
import bench_oai as b

a = argparse.ArgumentParser()
a.add_argument("--users", type=int, default=7); a.add_argument("--dur", type=int, default=300)
a.add_argument("--min", type=float, default=20); a.add_argument("--max", type=float, default=40)
a.add_argument("--predict", type=int, default=400); a.add_argument("--chars", type=int, default=20000)
a.add_argument("--code", action="store_true"); a.add_argument("--img", type=float, default=None)
a.add_argument("--gate-img", action="store_true"); a.add_argument("--rag", action="store_true")
a.add_argument("--seed", type=int, default=42)
a = a.parse_args()

stop = threading.Event(); lock = threading.Lock()
reqs = []; errs = []; ativos = [0]; pico = [0]; ag = []; imgs = []; rag = []


def pessoa(i):
    rnd = random.Random(a.seed + i)
    stop.wait(rnd.uniform(0, a.max))  # cada um começa num momento diferente
    k = 0
    while not stop.is_set():
        with lock:
            ativos[0] += 1; pico[0] = max(pico[0], ativos[0]); junto = ativos[0]
        try:
            r = b.chat(8000, "chat", b.prompt(i * 1000 + k, a.chars), a.predict)
            r["junto"] = junto; reqs.append(r)
        except Exception as e:
            errs.append("chat:" + repr(e)[:100])
        finally:
            with lock:
                ativos[0] -= 1
        k += 1
        stop.wait(rnd.uniform(a.min, a.max))


def agente():
    while not stop.is_set():
        t0 = time.time()
        try:
            r = b.chat(8001, "code", "Escreva um programa Python longo que implemente uma fila com testes. Explique cada função.", 400)
            ag.append((r["out"], time.time() - t0))
        except Exception as e:
            errs.append("agente:" + repr(e)[:100]); stop.wait(2)


def chat_ocupado():
    m = urllib.request.urlopen("http://127.0.0.1:8000/metrics", timeout=2).read().decode()
    return sum(float(x) for x in re.findall(r'^vllm:num_requests_(?:running|waiting)\{[^}]*\} ([0-9.]+)', m, re.M)) > 0


def imagens():
    import stress as s
    while not stop.is_set():
        w0 = time.time()
        if a.gate_img:
            while not stop.is_set() and chat_ocupado(): time.sleep(0.2)
        if stop.is_set(): break
        r = s.gen(); r["espera"] = round(time.time() - w0, 1); imgs.append(r)
        if r.get("erro"): errs.append("img:" + str(r["erro"])[:100])
        stop.wait(a.img)


def ragloop():
    docs = ["O prazo de troca por defeito é de 90 dias." * 3] * 20
    while not stop.is_set():
        s0 = time.time()
        try:
            for port, path, body in ((8002, "/v1/embeddings", {"model": "embed", "input": ["Qual o prazo de troca?"] * 8}),
                                     (8003, "/rerank", {"model": "rerank", "query": "prazo de troca", "documents": docs})):
                urllib.request.urlopen(urllib.request.Request(f"http://127.0.0.1:{port}{path}", json.dumps(body).encode(), {"Content-Type": "application/json"}), timeout=60).read()
            rag.append(time.time() - s0)
        except Exception as e:
            errs.append("rag:" + repr(e)[:100])
        stop.wait(2)


b.chat(8000, "chat", "Diga olá.", 5)
ths = [threading.Thread(target=pessoa, args=(i,)) for i in range(a.users)]
if a.code: ths.append(threading.Thread(target=agente))
if a.img is not None: ths.append(threading.Thread(target=imagens))
if a.rag: ths.append(threading.Thread(target=ragloop))
T0 = time.time(); [t.start() for t in ths]
time.sleep(a.dur); stop.set(); [t.join(timeout=300) for t in ths]
T = time.time() - T0

pct = lambda v, p: sorted(v)[min(len(v) - 1, int(len(v) * p))] if v else None
tt = [r["ttft"] for r in reqs]; dec = [r["dec_tps"] for r in reqs if r["dec_tps"]]
out = dict(modo="realista", conc=a.users, duracao_s=round(T), pedidos=len(reqs), erros=len(errs),
           junto_med=st.median(r["junto"] for r in reqs) if reqs else None, junto_max=pico[0],
           ttft_med=round(st.median(tt), 1) if tt else None, ttft_p95=round(pct(tt, .95), 1) if tt else None, ttft_max=round(max(tt), 1) if tt else None,
           dec_tps_por_req=round(st.median(dec), 1) if dec else None, dec_tps_p10=round(pct(dec, .10), 1) if dec else None)
if a.code: out.update(agente_pedidos=len(ag), agente_tok_s=round(sum(x[0] for x in ag) / T, 1))
if a.img is not None:
    seg = [i["seg"] for i in imgs if i.get("seg")]
    out.update(imagens=len(imgs), imagens_ok=sum(1 for i in imgs if i.get("ok")), img_seg_med=round(st.median(seg), 1) if seg else None,
               img_seg_max=max(seg) if seg else None, img_espera_med=round(st.median(i["espera"] for i in imgs), 1) if imgs else None,
               img_espera_max=max((i["espera"] for i in imgs), default=None))
if a.rag: out.update(rag_ciclos=len(rag), rag_med_s=round(st.median(rag), 2) if rag else None, rag_max_s=round(max(rag), 2) if rag else None)
out["erros_amostra"] = errs[:5]
print(json.dumps(out, ensure_ascii=False), flush=True)
