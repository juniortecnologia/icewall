#!/bin/bash
# Gemma-4-26B-A4B MoE NVFP4 como agente de código (13/14 no bench do delegate-local). Mesmo container e porta do serve-code.sh.
# A atenção padrão (flash_attn) não tem kernel para o GB10 (SM121) na imagem 26.09: usa a do Triton.
# Uso: serve-gemma.sh [util]
UTIL=${1:-0.22}
docker rm -f glis-code >/dev/null 2>&1
docker run -d --name glis-code --gpus all --ipc=host --ulimit memlock=-1 --ulimit stack=67108864 -v $HOME/glis-bench/vllmcache:/root/.cache/vllm \
  -e VLLM_SERVER_DEV_MODE=1 -p 127.0.0.1:8001:8001 -v $HOME/glis-bench/hf:/models:ro nvcr.io/nvidia/vllm:26.09-py3 \
  vllm serve /models/nvidia_Gemma-4-26B-A4B-NVFP4 --served-model-name code --port 8001 \
  --gpu-memory-utilization $UTIL --max-model-len 65536 --max-num-seqs 4 --enable-prefix-caching --language-model-only --attention-backend TRITON_ATTN
