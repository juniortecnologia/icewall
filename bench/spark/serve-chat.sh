#!/bin/bash
# 35B-A3B MoE NVFP4 (chat+RAG). Uso: serve-chat.sh [util] [mtp_tokens(0=off)] [max_seqs] [max_batched_tokens] [fcfs|priority] [long_prefill(0=off)] [max_model_len]
# priority: o pedido com "priority" menor passa na frente (o agente manda 10 para ficar atrás do chat).
# long_prefill: teto de tokens de prefill por pedido em cada passo, para um contexto longo não travar a geração dos outros.
# BIND (variável de ambiente): IPs onde publicar a porta, separados por espaço (ex.: "127.0.0.1 10.0.5.18"). Vazio = todas as interfaces (o Docker publica por fora do ufw).
# max_model_len: contexto máximo por pedido; o agente de código precisa de mais que os 32k do chat (o T7 do delegate-local tem ~52k).
UTIL=${1:-0.28}; MTP=${2:-0}; SEQS=${3:-16}; BATCH=${4:-8192}; POLICY=${5:-fcfs}; LONG=${6:-0}; MAXLEN=${7:-32768}
SPEC=""; [ "$MTP" != "0" ] && SPEC="--speculative-config {\"method\":\"mtp\",\"num_speculative_tokens\":$MTP}"
PUB=""; for ip in $BIND; do PUB="$PUB -p $ip:8000:8000"; done; [ -z "$PUB" ] && PUB="-p 8000:8000"
docker rm -f glis-chat >/dev/null 2>&1
docker run -d --name glis-chat --gpus all --ipc=host --ulimit memlock=-1 --ulimit stack=67108864 -v $HOME/glis-bench/vllmcache:/root/.cache/vllm \
  $PUB -v $HOME/glis-bench/hf:/models:ro nvcr.io/nvidia/vllm:26.09-py3 \
  vllm serve /models/nvidia_Qwen3.6-35B-A3B-NVFP4 --served-model-name chat --port 8000 \
  --gpu-memory-utilization $UTIL --max-model-len $MAXLEN --max-num-seqs $SEQS --max-num-batched-tokens $BATCH --scheduling-policy $POLICY --long-prefill-token-threshold $LONG \
  --enable-prefix-caching --reasoning-parser qwen3 --language-model-only $SPEC
