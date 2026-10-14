# Etapa 04 — UI e correções de containers

**Plano:** multi-servidor (extraído de `docs/plano-multi-servidor-treino-vllm.md`, Fase 1)
**Pré-requisito:** Etapa 03 concluída (coletores por servidor, coletor vLLM, dados com `server_id`)
**Status:** pendente

## Contexto (leitura obrigatória antes de executar)

### Premissas
- Servidores iniciais: **Station (local)** + **Spark (SSH, `spark-facini`/10.0.5.18)**; o icewall roda na Station e a trata como driver `local`.

### Estado que as etapas anteriores entregam
- Registro `servers` + drivers `local`/`ssh` com contrato único; `execOnServer(serverId, cmd)`.
- Coletores `health/docker/ollama/os` por servidor; Ollama como capacidade opcional ("offline" legítimo).
- Coletor vLLM (modelos, status, métricas, modelos de imagem) com chave por servidor.
- Jobs/snapshots/tabelas com `server_id`.

### Ponto de partida (diagnóstico 2026-10-14) — relevante para esta etapa
- **No Spark:** Ollama inativo; vLLM na porta 8001 com autenticação.
- **No código:** `/api/terminal/exec` hardcodeia `10.0.5.18`/`facini`.

## Objetivo
A página de servidores vira o monitor real multi-servidor, as ações da allowlist ficam parametrizadas por servidor e o terminal deixa de hardcodear o Spark.

## Tarefas

### 7. UI
- Página de servidores vira o monitor real: health, containers, modelos e vLLM **por servidor** (Station e Spark em paralelo).
- Ações da allowlist parametrizadas por servidor.
- Terminal sem `10.0.5.18` hardcoded (`/api/terminal/exec` resolve o servidor pelo registro).

### 8. Correções pontuais de containers
- Ações não dependem de snapshot "quente" (verificam o container na hora).
- Erros claros em vez de lista vazia.

## Validação da etapa (validação final do plano multi-servidor)
- [ ] Painel mostrando Spark **e** Station em paralelo: GPU, docker, Ollama (offline) e vLLM (autenticado) por servidor.
- [ ] Start/stop/logs de container funcionando nos dois servidores.
- [ ] Ações da allowlist parametrizadas por servidor; terminal executa no servidor selecionado (nada de `10.0.5.18` hardcoded).
- [ ] Ações de container verificam o container na hora (sem depender de snapshot quente); erros claros em vez de lista vazia.
- [ ] Typecheck + lint limpos.

## Convenções da etapa
- **Next 16:** começar a sessão lendo o doc relevante em `node_modules/next/dist/docs/`.
- **Segurança:** vLLM key e chave SSH nunca em respostas de GET nem expostas na UI; ações mutating exigem `x-icewall` + confirmação.
- **UI em pt-BR.** Commits: `git -c user.name="Junior Almeida" -c user.email="junioralmeidatecnologia@gmail.com" commit ...` com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca imprimir `.env.local` nem chaves; sem derrubar servidor que não se iniciou.
