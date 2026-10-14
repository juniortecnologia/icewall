# Etapa 01 — Registro central `servers` e drivers

**Plano:** multi-servidor (extraído de `docs/plano-multi-servidor-treino-vllm.md`, Fase 1)
**Pré-requisito:** nenhum (primeira etapa do plano multi-servidor)
**Status:** concluída (2026-10-14)

## Contexto (leitura obrigatória antes de executar)

### Premissas
- Servidores iniciais: **Station (local)** + **Spark (SSH, `spark-facini`/10.0.5.18)**; o icewall roda na Station e a trata como driver `local`.
- vLLM: **chave por servidor** no registro, nunca exposta na UI.

### Diagnóstico (estado verificado em 2026-10-14)
**No Spark (10.0.5.18):**
- **Ollama inativo** → toda a área de modelos (baseada em Ollama `:11434`) está cega.
- Só 1 container: `vllm-code` (`nvcr.io/nvidia/vllm:26.09-py3`), saudável. A stack antiga (serve-*.sh/Glis) não existe mais.
- **vLLM na porta 8001 com autenticação** (sem chave: `Unauthorized`); icewall tem zero integração real com vLLM.
- Portas: 8001 (vLLM, auth) e 11000 (aberta).

**No código:**
- Todo o monitoramento usa `sparkExec` com `SPARK_SSH_HOST` fixo → o painel depende do Spark.
- Fase 0 do plano de treino já existe: tabela `train_servers`, CRUD em `/api/train/servers`, `ServerDriver`/`SshDriver` em `src/lib/servers/` — usado só pela área de treino.
- `/api/terminal/exec` hardcodeia `10.0.5.18`/`facini`.

## Objetivo
Tornar o registro de servidores central e independente da área de treino, e garantir que o contrato de driver cubra **local e SSH**.

## Tarefas

### 1. Registro central `servers`
- Renomear `train_servers` → `servers` (migração do SQLite, sem perder histórico).
- Campos: `id, nome, tipo(local|ssh), host, porta, usuario, chaveSshPath, vllmUrl, vllmKey, capacidades(json), ultimoStatus, ultimoCheck`.
- Seed automático no primeiro boot: **Station (local)** + **Spark (ssh)**.
- Chave SSH e chave vLLM saem de todo `GET`.

### 2. Driver `local`
- Criar `src/lib/servers/driver-local.ts` com o mesmo contrato de `ServerDriver`/`SshDriver` (exec, put, get, ping).

## Validação da etapa
- [x] Migração `train_servers` → `servers` sem perda de dados; histórico antigo remanejado para o servidor Spark.
- [x] Seed automático cria Station (local) + Spark (ssh) no primeiro boot.
- [x] Nenhum `GET` retorna `chaveSshPath`/`vllmKey` (verificar nos endpoints de listagem e detalhe).
- [x] `driver-local.ts` cumpre o contrato (exec, put, get, ping) coberto por testes (vitest).
- [x] Typecheck + lint limpos (sem novos erros; 6 erros de lint pré-existentes em arquivos fora do escopo da etapa).

## Convenções da etapa
- **Next 16:** APIs/convenções podem diferir do conhecido — começar a sessão lendo o doc relevante em `node_modules/next/dist/docs/`.
- **Segurança:** chave SSH e chave vLLM nunca em respostas de GET; ações mutating exigem `x-icewall` + confirmação.
- **Migração:** `data/icewall.db` existente recebe as mudanças sem perder histórico.
- **UI em pt-BR.** Commits: `git -c user.name="Junior Almeida" -c user.email="junioralmeidatecnologia@gmail.com" commit ...` com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca imprimir `.env.local` nem chaves; sem derrubar servidor que não se iniciou.

## Notas de implementação (2026-10-14)

- **Migração** `drizzle/0010_servers.sql` (com `statement-breakpoint`s e `breakpoints: true` no journal): cria `servers`, remaneja todas as linhas de `train_servers` para `tipo='ssh'` preservando os ids (`INSERT...SELECT`) e `DROP TABLE train_servers`.
- **Seed** `src/server/db/seed.ts` roda em `open()` (client.ts) após `migrate()`; idempotente por nome único — linha existente é preservada, nunca duplicada/sobrescrita.
- **API** `/api/train/servers` (GET/POST) e `/api/train/servers/[id]` (GET/PUT/DELETE) substitui a rota antiga `/api/train` (removida); `safeServer()` (schemas.ts) é a única projeção devolvida em GET — sem `chaveSshPath`/`vllmKey`. PUT revalida estado mesclado: SSH sem host/usuario/chave → 400 `campos_ssh_incompletos`.
- **Driver local** `src/lib/servers/driver-local.ts` (exec via `sh -c`, put/get por `fs.copyFile`, ls/mkdir, ping) registrado como `local` em `drivers.ts`.
- **UI** `/servers`: tipo `local|ssh`, rotas `[id]` corretas, header `x-icewall: 1` nas mutações, campo de chave SSH no modal (vazio em edição = mantém a atual), coluna "vLLM" substitui a coluna de chave SSH fictícia.
- **Testes**: `src/app/api/train/servers/route.test.ts`, `src/lib/servers/driver-local.test.ts` (vitest); migração validada sobre cópia do banco real com histórico legado (teste pontual, removido após o veredito).
- **Next 16**: GETs chamam `await connection()` antes da query síncrona (cacheComponents); testes mockam `next/server`.
