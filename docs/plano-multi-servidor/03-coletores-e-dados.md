# Etapa 03 — Coletores e dados por servidor

**Plano:** multi-servidor (extraído de `docs/plano-multi-servidor-treino-vllm.md`, Fase 1)
**Pré-requisito:** Etapa 02 concluída (`execOnServer(serverId, cmd)` funcional; `sparkExec` como fachada)
**Status:** concluída (2026-10-14)

## Contexto (leitura obrigatória antes de executar)

### Premissas
- Servidores iniciais: **Station (local)** + **Spark (SSH, `spark-facini`/10.0.5.18)**; o icewall roda na Station e a trata como driver `local`.
- vLLM: **chave por servidor** no registro, nunca exposta na UI.

### Estado que as etapas anteriores entregam
- Registro `servers` com Station (local) + Spark (ssh); drivers com contrato único (exec, put, get, ping).
- `execOnServer(serverId, cmd)` centralizando a execução por servidor.

### Diagnóstico (2026-10-14) — relevante para esta etapa
**No Spark (10.0.5.18):**
- **Ollama inativo** → toda a área de modelos (baseada em Ollama `:11434`) está cega.
- **vLLM na porta 8001 com autenticação** (sem chave: `Unauthorized`); icewall tem zero integração real com vLLM.
- Portas: 8001 (vLLM, auth) e 11000 (aberta).

## Objetivo
Todos os coletores passam a operar por servidor (via driver), Ollama vira capacidade opcional, entra o primeiro coletor vLLM e os dados (jobs, snapshots, tabelas) passam a ter `server_id`.

## Tarefas

### 4. Coletores por servidor
- Refatorar `collectHealth/collectDocker/collectOllama/collectOs` para receberem o driver (em vez de `sparkExec` direto).
- **Ollama vira capacidade opcional**: serviço inativo = estado legítimo "offline" (não erro, não lista vazia).

### 5. Coletor vLLM (novo)
- `/v1/models` + status + métricas usando a chave por servidor.
- Detectar modelos de imagem (Z-Image, Qwen-Image) pela lista.

### 6. Scheduler e dados por servidor
- Jobs iteram sobre o registro `servers` (não mais sobre uma constante).
- Snapshots `server:{id}:{tipo}`.
- Colunas `server_id` em `metrics`, `container_stats`, `events`, `action_log` (migração + retenção ajustada; histórico antigo → servidor Spark).

## Validação da etapa
- [x] `collectHealth/collectDocker/collectOllama/collectOs` rodam nos dois servidores via driver.
- [x] Ollama inativo aparece como "offline" (estado legítimo) em vez de erro/blank.
- [x] Coletor vLLM retorna modelos, status e métricas do Spark (10.0.5.18:8001) usando a chave do registro; modelos de imagem (Z-Image, Qwen-Image) identificados na lista.
- [x] Jobs iteram sobre o registro; snapshots com chave `server:{id}:{tipo}`.
- [x] `server_id` presente em `metrics`, `container_stats`, `events`, `action_log`; histórico antigo apontando para Spark; retenção ajustada.
- [x] Typecheck + lint limpos.

## Notas de implementação (2026-10-14)

- **Coletores por servidor** (`src/server/spark/collectors/{health,docker,ollama,system}.ts`): todos reescritos para receberem `(server: ServerRef)` e executarem via driver (`execOnServer`); snapshot salvo com chave `server:{id}:{tipo}` (`serverSnapshotKey`) e toda inserção (`metrics`, `container_stats`) leva `server_id`. `sparkAuthMethods(host)` em `ssh.ts` substituiu a variante ligada à constante — `SPARK_HOST` restou apenas na área de bench.
- **Ollama como capacidade opcional** (`collectOllama`): sonda de porta pelo driver (`ss`/`netstat`) diferencia "serviço inativo" (snapshot `status: "offline"` + `reason` "serviço inativo", warn) de "servidor inacessível" (crit). `trackReachability` ganhou `severityDown` e `serverId`; base URL derivada do registro (local → `127.0.0.1`, ssh → host) com porta `OLLAMA_PORT` ?? 11434. `OLLAMA_URL` global (env) ficou apenas para ações manuais da allowlist.
- **Coletor vLLM novo** (`src/server/vllm/collector.ts`): `GET /health` (sem chave) + `GET /v1/models` e `GET /metrics` (Prometheus) com `Authorization: Bearer` da chave **do registro** (`servers.vllm_key`) — URL e chave nunca vêm de env. Estados `online` / `auth` (401 documentado: "chave do registro ainda rejeitada (HTTP 401) — aguardando borda") / `offline`; diff de modelos gera eventos; `isImageModel()` detecta Z-Image/Qwen-Image na lista; `parseMetrics()` retém apenas métricas `vllm:*` sem buckets de histograma. Job `vllm` no scheduler (15 s) roda só em servidores com `vllm_url` cadastrado.
- **Scheduler por servidor** (`src/server/scheduler.ts`): jobs iteram sobre `listServers()` (registro), não mais sobre uma constante — health, docker, ollama, vllm, security, updates, os por servidor.
- **Migração 0011** (`drizzle/0011_server_id.sql`, roda no boot via `migrate()`): coluna `server_id INTEGER` nula em `metrics`, `container_stats`, `events` e `action_log` + índices `(server_id, ts)` nas três tabelas de série temporal; histórico antigo remanejado para o Spark (id 2). Retenção de métricas agora agrega por hora **por servidor**.
- **Camada de leitura compatível**: `primaryServer()`/`primaryServerId()` em `executor.ts` (Spark quando cadastrado; senão o primeiro do registro) e `primarySnapshot(tipo)` em `lib/store.ts` — toda a UI/painel antigo (queries, JEV auditor/recommend, bench, allowlist, recommendation-apply) lê o servidor principal sem mudança de contrato. Ações mutating gravam `action_log` e eventos com o `server_id` do servidor principal.
- **Bug latente corrigido em `putSnapshot`**: erro sem snapshot anterior gravava `data: null` (viola `NOT NULL snapshots.data`) — agora grava `{}` (consumadores usam `?.`/`??`).
- **Validação**: one-shot sobre cópia do banco (`/tmp/opencode/val03/`, `tsx` com stub de `server-only`): migração (colunas, 0 nulls, histórico → Spark, 3 índices), registro (2 servidores, `primaryServerId()=2`, vLLM só no Spark), coletores nos dois (Spark: health 20 CPUs/temp≈59, docker 2 containers, ollama `offline`, vLLM `auth` 401 documentado, security 6 portas, 31 pacotes, OS/Ubuntu 24.04; Station: health 8 CPUs/33.6 GB, docker/ollama `offline` legítimos, sem snapshot vLLM), `server_id` preenchido nos novos inserts dos dois servidores, `primarySnapshot` lê o Spark, unidades `isImageModel`/`parseMetrics`. 32/32 OK. `tsc --noEmit` limpo; lint limpo nos arquivos tocados (6 erros pré-existentes em arquivos fora do escopo, da Etapa 01).
- **Decisões**: chave vLLM oficial = `SPARK_VLLM_API_KEY` do `.env.local`, gravada em `servers.vllm_key` (Spark id 2); a `VLLM_API_KEY` interna do container `vllm-code` é diferente e não é a fonte. 401 no `/v1/models` é estado legítimo pendente da borda Caddy no Spark — não é defeito do coletor.

## Convenções da etapa
- **Next 16:** começar a sessão lendo o doc relevante em `node_modules/next/dist/docs/`.
- **Segurança:** vLLM key e chave SSH nunca em respostas de GET; ações mutating exigem `x-icewall` + confirmação.
- **Migração de dados:** `data/icewall.db` existente recebe `server_id` sem perder histórico (histórico antigo → servidor Spark).
- **UI em pt-BR.** Commits: `git -c user.name="Junior Almeida" -c user.email="junioralmeidatecnologia@gmail.com" commit ...` com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca imprimir `.env.local` nem chaves; sem derrubar servidor que não se iniciou.
