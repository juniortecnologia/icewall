#!/bin/bash
# 35B-A3B MoE NVFP4 (chat+RAG). Uso: serve-chat.sh [util] [mtp_tokens(0=off)] [max_seqs] [max_batched_tokens] [fcfs|priority] [long_prefill(0=off)]
# priority: o pedido com "priority" menor passa na frente (o agente manda 10 para ficar atrás do chat).
# long_prefill: teto de tokens de prefill por pedido em cada passo, para um contexto longo não travar a geração dos outros.
UTIL=${1:-0.28}; MTP=${2:-0}; SEQS=${3:-16}; BATCH=${4:-8192}; POLICY=${5:-fcfs}; LONG=${6:-0}
SPEC=""; [ "$MTP" != "0" ] && SPEC="--speculative-config {\"method\":\"mtp\",\"num_speculative_tokens\":$MTP}"
docker rm -f glis-chat >/dev/null 2>&1
docker run -d --name glis-chat --gpus all --ipc=host --ulimit memlock=-1 --ulimit stack=67108864 -v $HOME/glis-bench/vllmcache:/root/.cache/vllm \
  -p 8000:8000 -v $HOME/glis-bench/hf:/models:ro nvcr.io/nvidia/vllm:26.09-py3 \
  vllm serve /models/nvidia_Qwen3.6-35B-A3B-NVFP4 --served-model-name chat --port 8000 \
  --gpu-memory-utilization $UTIL --max-model-len 32768 --max-num-seqs $SEQS --max-num-batched-tokens $BATCH --scheduling-policy $POLICY --long-prefill-token-threshold $LONG \
  --enable-prefix-caching --reasoning-parser qwen3 --language-model-only $SPEC
