#!/bin/bash
# Nemotron 3.5 Lightning 30B-A3B NVFP4 (chat+RAG). Uso: serve-nemo.sh [util] [dspark_tokens(0=off)] [max_seqs] [max_batched_tokens]
UTIL=${1:-0.28}; K=${2:-3}; SEQS=${3:-16}; BATCH=${4:-8192}
SPEC=""; [ "$K" != "0" ] && SPEC="--speculative-config {\"model\":\"/models/nvidia_Nemotron-3.5-Lightning-30B-A3B-NVFP4-DSpark\",\"num_speculative_tokens\":$K}"
docker rm -f glis-chat >/dev/null 2>&1
docker run -d --name glis-chat --gpus all --ipc=host --ulimit memlock=-1 --ulimit stack=67108864 -v $HOME/glis-bench/vllmcache:/root/.cache/vllm \
  -p 8000:8000 -v $HOME/glis-bench/hf:/models:ro nvcr.io/nvidia/vllm:26.09-py3 \
  vllm serve /models/nvidia_Nemotron-3.5-Lightning-30B-A3B-NVFP4 --served-model-name chat --port 8000 \
  --gpu-memory-utilization $UTIL --max-model-len 32768 --max-num-seqs $SEQS --max-num-batched-tokens $BATCH \
  --moe-backend marlin --kv-cache-dtype fp8 --enable-prefix-caching --mamba-backend flashinfer --mamba-cache-mode align \
  --reasoning-parser nemotron_v3 --tool-call-parser qwen3_coder --enable-auto-tool-choice $SPEC
