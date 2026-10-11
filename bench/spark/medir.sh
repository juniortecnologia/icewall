#!/bin/bash
# Roda um cenário e, no fim, imprime a menor memória disponível vista (amostra a cada 2 s), como JSON.
# Uso: medir.sh comando [args]
cd "$(dirname "$0")"
F=$(mktemp)
( while :; do awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo >>"$F"; sleep 2; done ) &
M=$!
"$@"
RC=$?
kill $M 2>/dev/null; wait $M 2>/dev/null
echo "{\"mem_min_disponivel_mb\": $(sort -n "$F" | head -1)}"
rm -f "$F"
exit $RC
