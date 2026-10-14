# Plano — Icewall: multi-servidor + treino Unsloth + vLLM/imagens

**Data:** 2026-10-14
**Status:** aprovado para execução (fase a fase, uma por sessão)

## Premissas (decididas com o usuário)
- Servidores iniciais: **Station (local)** + **Spark (SSH, `spark-facini`/10.0.5.18)**; o icewall roda na Station e a trata como driver `local`.
- Treino: **Unsloth real em docker** (CUDA + `finetune.py` + dataset HF) via `ServerDriver`.
- vLLM: **chave por servidor** no registro, nunca exposta na UI.
- MVP do treino: **LoRA/QLoRA SFT em texto + loss ao vivo + stop + export GGUF**.

## Diagnóstico (estado real, verificado via SSH em 2026-10-14)
**No Spark (10.0.5.18):**
- **Ollama inativo** → toda a área de modelos (baseada em Ollama `:11434`) está cega.
- Só 1 container: `vllm-code` (`nvcr.io/nvidia/vllm:26.09-py3`), saudável. A stack antiga (serve-*.sh/Glis) não existe mais.
- **vLLM na porta 8001 com autenticação** (sem chave: `Unauthorized`); icewall tem zero integração real com vLLM (só exibe versões de imagem no snapshot do SO).
- Portas: 8001 (vLLM, auth) e 11000 (aberta).

**No código:**
- Todo o monitoramento usa `sparkExec` com `SPARK_SSH_HOST` fixo → o painel depende do Spark.
- Fase 0 do plano de treino já existe: tabela `train_servers`, CRUD em `/api/train/servers`, `ServerDriver`/`SshDriver` em `src/lib/servers/` — usado só pela área de treino.
- `POST /api/fine-tune` inventa uma interface inexistente (`unslothai/unsloth:latest-nvidia python3 fine_tune.py --model ...`); assume modelo do Ollama (fora do ar).
- Não existe: GET de status/logs de treino, upload de datasets, jobs, gráfico de loss, tela `/treinar`.
- `/api/terminal/exec` hardcodeia `10.0.5.18`/`facini`.

## Fase 1 — Fundação multi-servidor (independência do Spark)
1. **Registro central `servers`** — renomear `train_servers` → `servers` (migração do SQLite), campos: `id, nome, tipo(local|ssh), host, porta, usuario, chaveSshPath, vllmUrl, vllmKey, capacidades(json), ultimoStatus, ultimoCheck`. Seed automático no primeiro boot: Station (local) + Spark (ssh). Chave SSH e chave vLLM saem de todo `GET`.
2. **Driver `local`** em `src/lib/servers/driver-local.ts` com o mesmo contrato de `ServerDriver`/`SshDriver` (exec, put, get, ping).
3. **Executor por servidor** — `execOnServer(serverId, cmd)`; `sparkExec` vira fachada sobre o servidor "Spark" do registro (migração incremental dos coletores, sem big-bang).
4. **Coletores por servidor** — refatorar `collectHealth/collectDocker/collectOllama/collectOs` para receberem o driver; **Ollama vira capacidade opcional**: serviço inativo = estado legítimo "offline".
5. **Coletor vLLM (novo)** — `/v1/models` + status + métricas usando a chave por servidor; detectar modelos de imagem (Z-Image, Qwen-Image) pela lista.
6. **Scheduler e dados por servidor** — jobs iteram sobre o registro; snapshots `server:{id}:{tipo}`; colunas `server_id` em `metrics`, `container_stats`, `events`, `action_log` (migração + retenção ajustada).
7. **UI** — página de servidores vira o monitor real (health, containers, modelos, vLLM por servidor); ações da allowlist parametrizadas por servidor; terminal sem `10.0.5.18` hardcoded.
8. **Correções pontuais de containers** — ações não dependem de snapshot "quente" (verificam o container na hora); erros claros em vez de lista vazia.

**Validação da Fase 1:** painel mostrando Spark **e** Station em paralelo (GPU, docker, Ollama offline, vLLM autenticado), com start/stop/logs de container funcionando nos dois.

## Fase 2 — Treino `/treinar` (MVP do Unsloth Studio)
1. **Runner real de treino** — container CUDA + Unsloth (`finetune.py`) com dataset HF, em vez do comando fictício atual. **Na sessão de implementação, validar a interface real (imagem/args) num mini-run no Spark antes de construir o resto.**
2. **Datasets** — upload (multipart) → conversão JSONL/parquet → validação (duplicados, vazios, tamanho) → preview → SFTP para o servidor (`/api/train/datasets/*`).
3. **Jobs** — `POST/GET /api/train/jobs`, `GET :id`, `POST :id/stop`; presets de hiperparâmetros por classe de modelo (rank/alpha/lr/epochs/batch nos defaults do Unsloth); método `lora|qlora|full`; workspace `/tmp/icewall-ft-{runId}` no servidor; run via nohup + pid (padrão já usado). O `POST /api/fine-tune` atual vira alias/legado ou é removido.
4. **Monitoramento ao vivo** — poll do log remoto via driver (2–3 s), parse das linhas de loss (formato do Unsloth), atualização de `lossHistory`/progresso + GPU mem (`nvidia-smi`); **SSE** para o navegador; gráfico de loss curve (recharts já é dependência); ETA.
5. **Tela `/treinar`** — stepper de 5 passos (servidor → modelo base → dataset → configuração → executar/monitorar), lista de runs com status, página de detalhe com gráfico, logs e stop.
6. **Export GGUF** (fim do MVP) — quantização via container do toolkit GGUF do Unsloth, lista de checkpoints, download para a Station.

**Validação da Fase 2:** treino real pequeno no Spark (modelo pequeno, poucos passos) → loss curve ao vivo no navegador → stop → export GGUF baixado.

## Fase 3 — vLLM e modelos de imagem
1. **Área de modelos unificada** — Ollama (quando ativo) + vLLM + treinados, por servidor.
2. **Geração de imagem** — `POST /api/servers/:id/images/generate` (proxy para o endpoint de imagem do vLLM com a chave do servidor), resultado salvo e com preview na UI.
3. **Ações vLLM na allowlist** — start/stop/restart/logs do container do vLLM (reaproveitando o mecanismo de containers) + estado do serviço.

**Validação da Fase 3:** gerar uma imagem na UI via `z-image` no vLLM; modelos de imagem listados junto dos de texto.

## Riscos e notas
- **Next 16:** pelo AGENTS.md, APIs/convenções podem diferir do conhecido — cada sessão de implementação começa lendo o doc relevante em `node_modules/next/dist/docs/`.
- **Contradição de porta:** o plano antigo de treino diz porta 4000, mas o serviço roda em **4310** — manter 4310 (corrigir o doc ao implementar).
- **Segurança:** vLLM key e chave SSH nunca em respostas de GET; ações mutating continuam exigindo `x-icewall` + confirmação.
- **Migração de dados:** `data/icewall.db` existente recebe `server_id` sem perder histórico (histórico antigo → servidor Spark).
- **Ordem:** Fase 1 → 2 → 3, uma por sessão; testes (vitest) + typecheck + lint por fase.
- **Convenções do projeto:** UI em pt-BR; commits `git -c user.name="Junior Almeida" -c user.email="junioralmeidatecnologia@gmail.com" commit ...` com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; nunca imprimir `.env.local` nem chaves; sem derrubar servidor que não se iniciou.

## Sincronia com docs existentes
- `docs/train/plans/02..05` (fases 0–2 do treino antigo): a Fase 0 já foi implementada; as fases 1A/1B/2 daquele plano são substituídas/absorvidas pela Fase 2 deste plano (mesmo escopo MVP).
- Ao iniciar a execução, atualizar/cruzar referências nos docs de `docs/train/plans/` para apontar para este plano.
