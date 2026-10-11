#!/bin/bash
cd ~/glis-bench
wait_up(){ for i in $(seq 1 80); do docker logs $1 2>&1 | grep -q -E "startup complete" && return 0; docker logs $1 2>&1 | grep -q "Traceback" && { echo "FALHOU $1"; return 1; }; sleep 8; done; echo "TIMEOUT $1"; return 1; }
docker rm -f glis-chat glis-code glis-mps >/dev/null 2>&1
./serve-code.sh 0.30 3 >/dev/null; wait_up glis-code && echo "code ok $(date +%T)"
./serve-chat.sh 0.24 2 16 >/dev/null; wait_up glis-chat && echo "chat ok $(date +%T)"
./serve-pool.sh embed 0.09 >/dev/null; wait_up glis-embed && echo "embed ok $(date +%T)"
./serve-pool.sh rerank 0.09 >/dev/null; wait_up glis-rerank && echo "rerank ok $(date +%T)"
echo FIM
