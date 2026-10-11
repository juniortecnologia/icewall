#!/bin/bash
# gpt-oss-20b MoE MXFP4 (3,6B ativos) como agente de código. Mesmo container e porta do serve-code.sh.
# Uso: serve-gptoss.sh [util]
UTIL=${1:-0.18}
docker rm -f glis-code >/dev/null 2>&1
docker run -d --name glis-code --gpus all --ipc=host --ulimit memlock=-1 --ulimit stack=67108864 -v $HOME/glis-bench/vllmcache:/root/.cache/vllm \
  -e VLLM_SERVER_DEV_MODE=1 -p 127.0.0.1:8001:8001 -v $HOME/glis-bench/hf:/models:ro nvcr.io/nvidia/vllm:26.09-py3 \
  vllm serve /models/openai_gpt-oss-20b --served-model-name code --port 8001 \
  --gpu-memory-utilization $UTIL --max-model-len 65536 --max-num-seqs 4 --enable-prefix-caching
