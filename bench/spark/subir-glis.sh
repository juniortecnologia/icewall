#!/bin/bash
# Configuração de produção do eFacini Glis no Spark (decisão de 12/10/2026): chat + RAG + agente no mesmo Qwen3.6-35B-A3B,
# Qwen3-Embedding-4B e Qwen3-Reranker-4B. Uso: subir-glis.sh   (BIND="127.0.0.1 10.0.5.18" por padrão)
# Derruba os containers glis-* antigos, tira o Ollama do caminho e sobe tudo na ordem, esperando cada um ficar pronto.
# Memória: chat 0,30 + embed 0,10 + rerank 0,10 = 0,50; o resto fica para o ComfyUI (FLUX.2 klein ~20 GB livres).
cd "$(dirname "$0")"
# 127.0.0.1 mantém a bancada e os health checks locais funcionando; o IP interno é por onde o Glis chega.
# O Docker publica por fora do ufw, então nunca deixar a porta em 0.0.0.0.
export BIND=${BIND:-"127.0.0.1 10.0.5.18"}
set -u

# Ollama fora do caminho: descarrega os modelos que ele segura na memória unificada.
if command -v ollama >/dev/null 2>&1; then
  for m in $(ollama ps 2>/dev/null | awk 'NR>1 {print $1}'); do ollama stop "$m" && echo "ollama: $m descarregado"; done
  systemctl is-active --quiet ollama 2>/dev/null && echo "aviso: o serviço ollama está ativo e volta a carregar modelos sob demanda; 'sudo systemctl disable --now ollama' para tirar de vez"
fi

docker rm -f glis-chat glis-code glis-embed glis-rerank glis-mps >/dev/null 2>&1

# Chat primeiro (o maior). MTP 2, 16 sequências, prefill fatiado em 2048 (rodada 16), agente com priority 10.
./subir.sh glis-chat serve-chat.sh 0.30 2 16 8192 priority 2048 || exit 1
./subir.sh glis-embed serve-pool.sh embed 0.10 || exit 1
./subir.sh glis-rerank serve-pool.sh rerank 0.10 || exit 1

# O ComfyUI (:8188) não sobe aqui. Só confere onde ele escuta, porque o --listen padrão dele costuma ser 0.0.0.0.
echo "--- portas (esperado: só 127.0.0.1 e $BIND)"
ss -ltn 2>/dev/null | awk 'NR==1 || $4 ~ /:(8000|8002|8003|8188)$/'
ss -ltn 2>/dev/null | awk '$4 ~ /^(0\.0\.0\.0|\[::\]|\*):(8000|8002|8003|8188)$/ {print "ATENÇÃO: " $4 " escuta em todas as interfaces"; r=1} END {exit r}' && echo "ok: nenhuma porta do Glis exposta em todas as interfaces"
echo "memória livre: $(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo) MB"
