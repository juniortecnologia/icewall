#!/usr/bin/env python3
# Semáforo de GPU: pausa o agente de código (27B, vLLM dev mode /pause?mode=keep) enquanto o chat (35B) ou o ComfyUI
# tiverem trabalho ativo; retoma após HOLD s ociosos. Uso: gate.py [hold_s]  (Ctrl-C/SIGTERM imprime o resumo)
import json, re, signal, sys, time, urllib.request

HOLD = float(sys.argv[1]) if len(sys.argv) > 1 else 1.0
CHAT, CODE, COMFY = "http://127.0.0.1:8000", "http://127.0.0.1:8001", "http://127.0.0.1:8188"


def get(u, t=2):
    return urllib.request.urlopen(u, timeout=t).read().decode()


def post(u):
    return urllib.request.urlopen(urllib.request.Request(u, method="POST"), timeout=5).read()


def chat_busy():
    m = get(CHAT + "/metrics")
    return sum(float(x) for x in re.findall(r'^vllm:num_requests_(?:running|waiting)\{[^}]*\} ([0-9.]+)', m, re.M)) > 0


def img_busy():
    q = json.loads(get(COMFY + "/queue"))
    return bool(q.get("queue_running") or q.get("queue_pending"))


paused = False; t_pause = None; total = 0.0; n = 0; last_busy = 0.0


def fim(*_):
    global total
    if paused: total += time.time() - t_pause
    print(f"gate: {n} pausas, {total:.1f} s pausado", flush=True); sys.exit(0)


signal.signal(signal.SIGTERM, fim); signal.signal(signal.SIGINT, fim)
while True:
    try:
        busy = chat_busy() or img_busy()
    except Exception:
        busy = True  # na dúvida, protege o chat
    now = time.time()
    if busy:
        last_busy = now
        if not paused:
            post(CODE + "/pause?mode=keep"); paused = True; t_pause = now; n += 1
    elif paused and now - last_busy >= HOLD:
        post(CODE + "/resume"); paused = False; total += now - t_pause
    time.sleep(0.1)
