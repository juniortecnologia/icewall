#!/usr/bin/env python3
# Teste integrado no Spark: imagem (ComfyUI FLUX.2 klein 4B distilado) + chat 35B-A3B + código 27B + embed/rerank.
# Uso: stress.py img N [flux|qwen|zimage] | all
import json, sys, threading, time, urllib.request, random, statistics as st
sys.path.insert(0, ".")
import bench_oai as b

COMFY = "http://127.0.0.1:8188"


IMG = "flux"  # flux (FLUX.2 klein 4B, 4 passos) | qwen (Qwen-Image-2512 FP8 + Lightning, 4 passos) | zimage (Z-Image-Turbo, 8 passos)


def wf(prompt, seed, w=1024, h=1024):
    return {"flux": wf_flux, "qwen": wf_qwen, "zimage": wf_zimage}[IMG](prompt, seed, w, h)


def wf_ksampler(unet, clip, clip_type, vae, prompt, seed, w, h, steps, sampler, shift, lora=None):
    # Qwen-Image e Z-Image: ModelSamplingAuraFlow + KSampler com cfg 1 (negativo zerado). O SaveImage é o nó "13", como no FLUX.
    modelo = ["1", 0]
    g = {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": unet, "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": clip, "type": clip_type, "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": vae}},
    }
    if lora:
        g["14"] = {"class_type": "LoraLoaderModelOnly", "inputs": {"model": modelo, "lora_name": lora, "strength_model": 1.0}}
        modelo = ["14", 0]
    g.update({
        "4": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["2", 0]}},
        "5": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["4", 0]}},
        "6": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": modelo, "shift": shift}},
        "10": {"class_type": "EmptySD3LatentImage", "inputs": {"width": w, "height": h, "batch_size": 1}},
        "11": {"class_type": "KSampler", "inputs": {"model": ["6", 0], "seed": seed, "steps": steps, "cfg": 1.0, "sampler_name": sampler, "scheduler": "simple",
                                                    "positive": ["4", 0], "negative": ["5", 0], "latent_image": ["10", 0], "denoise": 1.0}},
        "12": {"class_type": "VAEDecode", "inputs": {"samples": ["11", 0], "vae": ["3", 0]}},
        "13": {"class_type": "SaveImage", "inputs": {"images": ["12", 0], "filename_prefix": "glisbench-" + IMG}},
    })
    return g


def wf_qwen(prompt, seed, w, h):
    return wf_ksampler("qwen_image_2512_fp8_e4m3fn.safetensors", "qwen_2.5_vl_7b_fp8_scaled.safetensors", "qwen_image", "qwen_image_vae.safetensors",
                       prompt, seed, w, h, 4, "euler", 3.1, lora="Qwen-Image-2512-Lightning-4steps-V1.0-bf16.safetensors")


def wf_zimage(prompt, seed, w, h):
    return wf_ksampler("z_image_turbo_bf16.safetensors", "qwen_3_4b.safetensors", "lumina2", "ae.safetensors", prompt, seed, w, h, 8, "res_multistep", 3.0)


def wf_flux(prompt, seed, w=1024, h=1024, steps=4):
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


def liberar():
    # Descarrega os modelos do ComfyUI: trocar de modelo de imagem sem isso deixa dois carregados na memória unificada.
    req = urllib.request.Request(COMFY + "/free", json.dumps({"unload_models": True, "free_memory": True}).encode(), {"Content-Type": "application/json"})
    urllib.request.urlopen(req, timeout=30).read()


def gen(prompt="Foto de produto: fone de ouvido preto sobre fundo branco, iluminação de estúdio, anúncio de e-commerce", seed=None, prefixo=None):
    t0 = time.time()
    g = wf(prompt, random.randint(0, 2**31) if seed is None else seed)
    if prefixo: g["13"]["inputs"]["filename_prefix"] = prefixo
    req = urllib.request.Request(COMFY + "/prompt", json.dumps({"prompt": g}).encode(), {"Content-Type": "application/json"})
    try:
        pid = json.load(urllib.request.urlopen(req, timeout=30))["prompt_id"]
    except urllib.error.HTTPError as e:
        return dict(erro=e.read().decode()[:400])
    while time.time() - t0 < 600:
        h = json.load(urllib.request.urlopen(f"{COMFY}/history/{pid}", timeout=30))
        if pid in h:
            s = h[pid]["status"]
            return dict(seg=round(time.time() - t0, 1), ok=s.get("status_str") == "success", imgs=len(h[pid].get("outputs", {}).get("13", {}).get("images", [])),
                        arquivos=[i["filename"] for i in h[pid].get("outputs", {}).get("13", {}).get("images", [])],
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
        if len(sys.argv) > 3: IMG = sys.argv[3]
        liberar()
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
