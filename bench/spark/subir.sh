#!/bin/bash
# Sobe um serviço da bancada e espera o vLLM ficar pronto (o mesmo wait_up do subir-tudo.sh).
# Uso: subir.sh CONTAINER SCRIPT [args do script]. Imprime "ok CONTAINER SEGUNDOS" ou "falhou CONTAINER motivo" e as últimas linhas do log.
cd "$(dirname "$0")"
C=$1; S=$2; shift 2
T0=$(date +%s); M0=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
"./$S" "$@" >/dev/null || { echo "falhou $C docker run"; exit 1; }
for i in $(seq 1 120); do
  L=$(docker logs "$C" 2>&1)
  if grep -q "startup complete" <<<"$L"; then echo "ok $C $(( $(date +%s) - T0 ))"; exit 0; fi
  if grep -q "Traceback" <<<"$L" || ! docker ps -q -f "name=^$C$" | grep -q .; then
    # a causa vai por último: o ICEWALL guarda o fim da saída
    # a causa costuma estar no EngineCore, acima da pilha do APIServer; o "initialization failed" genérico não diz nada
    echo "falhou $C erro"; tail -12 <<<"$L"; echo "--- causa:"
    grep -E "(Error|Exception)\b.*:|out of memory|less than desired|No available memory" <<<"$L" | grep -v "Engine core initialization failed" | tail -6
    echo "--- memória livre agora: $(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo) MB (início: $M0 MB)"; exit 1
  fi
  sleep 8
done
echo "falhou $C timeout"; docker logs --tail 20 "$C" 2>&1; echo "--- memória livre no início: $M0 MB"; exit 1
