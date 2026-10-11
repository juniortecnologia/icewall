#!/usr/bin/env python3
# Prefill/decode do agente (27B) em contexto longo: frio vs prefix-cache quente. Uso: ctx_test.py PORT MODEL
import sys, time
sys.path.insert(0, ".")
import bench_oai as b

port, model = int(sys.argv[1]), sys.argv[2]
P = b.PRD * 3


def show(tag, r):
    print(f"{tag:28} prompt={r['prompt']:>6} tok  TTFT={r['ttft']:6.1f}s  decode={r['dec_tps']:.1f} tok/s", flush=True)


for chars, tag in ((60000, "~17k tok"), (120000, "~34k tok"), (200000, "~57k tok")):
    txt = f"[sessao {chars}-{time.time_ns()}]\n" + P[:chars] + "\n\nPergunta: liste 3 riscos citados."
    show(tag + " frio", b.chat(port, model, txt, 150))
    show(tag + " cache quente", b.chat(port, model, txt, 150))
