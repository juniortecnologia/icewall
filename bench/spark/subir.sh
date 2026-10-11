#!/bin/bash
# Sobe um serviço da bancada e espera o vLLM ficar pronto (o mesmo wait_up do subir-tudo.sh).
# Uso: subir.sh CONTAINER SCRIPT [args do script]. Imprime "ok CONTAINER SEGUNDOS" ou "falhou CONTAINER motivo" e as últimas linhas do log.
cd "$(dirname "$0")"
C=$1; S=$2; shift 2
T0=$(date +%s)
"./$S" "$@" >/dev/null || { echo "falhou $C docker run"; exit 1; }
for i in $(seq 1 120); do
  L=$(docker logs "$C" 2>&1)
  if grep -q "startup complete" <<<"$L"; then echo "ok $C $(( $(date +%s) - T0 ))"; exit 0; fi
  if grep -q "Traceback" <<<"$L" || ! docker ps -q -f "name=^$C$" | grep -q .; then
    echo "falhou $C erro"; tail -20 <<<"$L"; exit 1
  fi
  sleep 8
done
echo "falhou $C timeout"; docker logs --tail 20 "$C" 2>&1; exit 1
