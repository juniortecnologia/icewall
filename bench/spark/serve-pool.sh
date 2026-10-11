#!/bin/bash
# Embedding/Reranker 4B. Uso: serve-pool.sh embed|rerank [util]
KIND=$1; UTIL=${2:-0.09}
if [ "$KIND" = embed ]; then NAME=glis-embed; PORT=8002; MODEL=Qwen_Qwen3-Embedding-4B; ARGS="--runner pooling --served-model-name embed"
else NAME=glis-rerank; PORT=8003; MODEL=Qwen_Qwen3-Reranker-4B; ARGS="--runner pooling --served-model-name rerank --chat-template /tpl/qwen3_reranker.jinja --hf-overrides {\"architectures\":[\"Qwen3ForSequenceClassification\"],\"classifier_from_token\":[\"no\",\"yes\"],\"is_original_qwen3_reranker\":true}"; fi
docker rm -f $NAME >/dev/null 2>&1
docker run -d --name $NAME --gpus all --ipc=host --ulimit memlock=-1 --ulimit stack=67108864 -p $PORT:$PORT \
  -v $HOME/glis-bench/hf:/models:ro -v $HOME/glis-bench/qwen3_reranker.jinja:/tpl/qwen3_reranker.jinja:ro -v $HOME/glis-bench/vllmcache:/root/.cache/vllm nvcr.io/nvidia/vllm:26.09-py3 \
  vllm serve /models/$MODEL --port $PORT --gpu-memory-utilization $UTIL --max-model-len 8192 --max-num-seqs 16 $ARGS
