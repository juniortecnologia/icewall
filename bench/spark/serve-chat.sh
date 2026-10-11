#!/bin/bash
# 35B-A3B MoE NVFP4 (chat+RAG). Uso: serve-chat.sh [util] [mtp_tokens(0=off)] [max_seqs]
UTIL=${1:-0.28}; MTP=${2:-0}; SEQS=${3:-16}
SPEC=""; [ "$MTP" != "0" ] && SPEC="--speculative-config {\"method\":\"mtp\",\"num_speculative_tokens\":$MTP}"
docker rm -f glis-chat >/dev/null 2>&1
docker run -d --name glis-chat --gpus all --ipc=host --ulimit memlock=-1 --ulimit stack=67108864 -v $HOME/glis-bench/vllmcache:/root/.cache/vllm \
  -p 8000:8000 -v $HOME/glis-bench/hf:/models:ro nvcr.io/nvidia/vllm:26.09-py3 \
  vllm serve /models/nvidia_Qwen3.6-35B-A3B-NVFP4 --served-model-name chat --port 8000 \
  --gpu-memory-utilization $UTIL --max-model-len 32768 --max-num-seqs $SEQS --max-num-batched-tokens 8192 \
  --enable-prefix-caching --reasoning-parser qwen3 --language-model-only $SPEC
