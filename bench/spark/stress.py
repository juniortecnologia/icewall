#!/usr/bin/env python3
# Teste integrado no Spark: imagem (ComfyUI FLUX.2 klein 4B distilado) + chat 35B-A3B + código 27B + embed/rerank.
# Uso: stress.py img N | all
import json, sys, threading, time, urllib.request, random, statistics as st
sys.path.insert(0, ".")
import bench_oai as b

COMFY = "http://127.0.0.1:8188"


def wf(prompt, seed, w=1024, h=1024, steps=4):
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "flux-2-klein-4b.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": "qwen_3_4b.safetensors", "type": "flux2", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "flux2-vae.safetensors"}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["2", 0]}},
        "5": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["4", 0]}},
        "6": {"class_type": "CFGGuider", "inputs": {"model": ["1", 0], "positive": ["4", 0], "negative": ["5", 0], "cfg": 1.0}},
        "7": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler"}},
        "8": {"class_type": "Flux2Scheduler", "inputs": {"steps": steps, "width": w, "height": h}},
        "9": {"class_type": "RandomNoise", "inputs": {"noise_seed": seed}},
        "10": {"class_type": "EmptyFlux2LatentImage", "inputs": {"width": w, "height": h, "batch_size": 1}},
        "11": {"class_type": "SamplerCustomAdvanced", "inputs": {"noise": ["9", 0], "guider": ["6", 0], "sampler": ["7", 0], "sigmas": ["8", 0], "latent_image": ["10", 0]}},
        "12": {"class_type": "VAEDecode", "inputs": {"samples": ["11", 0], "vae": ["3", 0]}},
        "13": {"class_type": "SaveImage", "inputs": {"images": ["12", 0], "filename_prefix": "glisbench"}},
    }


def gen(prompt="Foto de produto: fone de ouvido preto sobre fundo branco, iluminação de estúdio, anúncio de e-commerce"):
    t0 = time.time()
    req = urllib.request.Request(COMFY + "/prompt", json.dumps({"prompt": wf(prompt, random.randint(0, 2**31))}).encode(), {"Content-Type": "application/json"})
    try:
        pid = json.load(urllib.request.urlopen(req, timeout=30))["prompt_id"]
    except urllib.error.HTTPError as e:
        return dict(erro=e.read().decode()[:400])
    while time.time() - t0 < 600:
        h = json.load(urllib.request.urlopen(f"{COMFY}/history/{pid}", timeout=30))
        if pid in h:
            s = h[pid]["status"]
            return dict(seg=round(time.time() - t0, 1), ok=s.get("status_str") == "success", imgs=len(h[pid].get("outputs", {}).get("13", {}).get("images", [])),
                        erro=None if s.get("status_str") == "success" else str(s)[:300])
        time.sleep(0.25)
    return dict(erro="timeout")


def loop_imgs(n, out):
    out.extend(gen() for _ in range(n))


def chat_level(n):
    return b.level(8000, "chat", n, 20000, 200)


def rag_calls(secs, out):  # embed + rerank contínuos (simula a recuperação do RAG)
    t0 = time.time(); lat = []
    docs = ["O prazo de troca por defeito é de 90 dias." * 3] * 20
    while time.time() - t0 < secs:
        s = time.time()
        for port, path, body in ((8002, "/v1/embeddings", {"model": "embed", "input": ["Qual o prazo de troca?"] * 8}),
                                 (8003, "/rerank", {"model": "rerank", "query": "prazo de troca", "documents": docs})):
            req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", json.dumps(body).encode(), {"Content-Type": "application/json"})
            urllib.request.urlopen(req, timeout=60).read()
        lat.append(time.time() - s); time.sleep(0.5)
    out.append(dict(rag_ciclos=len(lat), rag_med_s=round(st.median(lat), 2), rag_max_s=round(max(lat), 2)))


if __name__ == "__main__":
    mode = sys.argv[1]
    if mode == "img":
        n = int(sys.argv[2]); print("# 1ª inclui carga dos modelos"); [print(json.dumps(gen(), ensure_ascii=False), flush=True) for _ in range(n)]
    elif mode == "all":
        scen = sys.argv[2]
        stop = threading.Event(); bgres = {}; threads = []
        if "code" in scen:
            t = threading.Thread(target=b.bg, args=(8001, "code", 200, stop, bgres)); t.start(); threads.append(t)
        imgs = []; ragout = []
        if "img" in scen:
            t = threading.Thread(target=loop_imgs, args=(3, imgs)); t.start(); threads.append(t)
        if "rag" in scen:
            t = threading.Thread(target=rag_calls, args=(60, ragout)); t.start(); threads.append(t)
        time.sleep(6)
        print(json.dumps(dict(cenario=scen, chat=chat_level(7)), ensure_ascii=False), flush=True)
        stop.set()
        for t in threads: t.join()
        print(json.dumps(dict(imgs=imgs, rag=ragout, code_dec_tps=round(st.median(bgres["rates"]), 1) if bgres.get("rates") else None), ensure_ascii=False))
