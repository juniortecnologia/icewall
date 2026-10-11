#!/bin/bash
# 27B denso NVFP4 + MTP (agente de código). Uso: serve-code.sh [util] [mtp_tokens]
UTIL=${1:-0.30}; MTP=${2:-3}
SPEC=""; [ "$MTP" != "0" ] && SPEC="--speculative-config {\"method\":\"mtp\",\"num_speculative_tokens\":$MTP}"
docker rm -f glis-code >/dev/null 2>&1
docker run -d --name glis-code --gpus all --ipc=host --ulimit memlock=-1 --ulimit stack=67108864 -v $HOME/glis-bench/vllmcache:/root/.cache/vllm \
  -e VLLM_SERVER_DEV_MODE=1 -p 127.0.0.1:8001:8001 -v $HOME/glis-bench/hf:/models:ro nvcr.io/nvidia/vllm:26.09-py3 \
  vllm serve /models/nvidia_Qwen3.8-27B-NVFP4 --served-model-name code --port 8001 \
  --gpu-memory-utilization $UTIL --max-model-len 65536 --max-num-seqs 4 --enable-prefix-caching \
  --reasoning-parser qwen3 --language-model-only \
  $SPEC
