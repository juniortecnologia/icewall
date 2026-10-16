# Fase 2 — Aba `/treinar`: treino, quantização e fine-tuning (Lab → Produção)

**Data:** 2026-10-15
**Status:** em execução (T0, T1 e T2 concluídas)
**Substitui/absorve:** `docs/train/plans/02..05` (convenções desatualizadas) e detalha a Fase 2 de `docs/plano-multi-servidor-treino-vllm.md`

---

## 1. Diagnóstico verificado (auditoria 2026-10-15)

### Estado do roadmap
- **Fase 1 (multi-servidor) implementada:** registro `servers` (sigilo `chaveSshPath`/`vllmKey` via `safeServer`), drivers `local`/`ssh`, `execOnServer`, coletores por servidor, coletor vLLM, `server_id` nas tabelas.
- **Review sênior anterior executada** (commits S1–S6: segredos, JWT único, erros de API, `withAuth`, testes de rotas, limpeza).
- **Fase 2 (treino `/treinar`) pendente** — escopo deste plano. Typecheck limpo; higiene de código alta (0 `any`, 0 TODO).

### Problemas encontrados
1. 🔴 **`POST /api/fine-tune` (legado, `src/app/api/fine-tune/route.ts`):** rota mutante **sem `guardMutation` nem auth** (escapa do padrão de segurança); `run.sh` quebrado (`-v /mnt/data:/data \\\\` gera `\\` — continuação de linha inválida no bash); chama `python3 fine_tune.py` que não existe na imagem `unslothai/unsloth`; assume Ollama (offline no Spark). **Removida na T0.**
2. 🟡 Tabelas `fine_tune_runs`/`fine_tune_exports` (migração 0006) **sem nenhum GET** — nenhum progresso/status/logs/exports legível. **Substituídas na T0 por `train_jobs`/`train_datasets`/`train_artifacts`.**
3. 🟡 `docs/train/plans/02..05` com convenções desatualizadas (porta 4000, `unsloth list-models`) — apontam para este plano.
4. 🟡 Cobertura de teste das rotas `train/*` quase nula (só `servers/route.test.ts`) — T0 adiciona contratos para jobs.

---

## 2. Documentação validada (Context7, 2026-10-15)

- **Next.js 16:** `connection()` antes de leitura dinâmica (com `cacheComponents`); **SSE em route handler** via `ReadableStream` + `Content-Type: text/event-stream` (padrão oficial — base dos logs ao vivo, Etapa T2); `params` é `Promise` em rotas dinâmicas.
- **Unsloth:** presets LoRA recomendados (r=16, alpha=16, dropout=0); quantização nativa no fim do treino: `model.save_pretrained_gguf(dir, tokenizer, quantization_method="q4_k_m"|"q8_0"|"f16")`; tabela completa de quants (`q2_k`…`q8_0`, `f16`).
- **llama.cpp (quantização pós-treino, independente do Unsloth):** `convert_hf_to_gguf.py --outtype f16` → `llama-quantize [--imatrix imatrix.gguf] in out q4_k_m`.
- **vLLM (produção):** `vllm serve <base> --enable-lora --lora-modules nome=path`; adapters atualizáveis em runtime (`VLLM_ALLOW_RUNTIME_LORA_UPDATING=True` — apenas em ambiente isolado/confiável).

---

## 3. Conceito da aba (coerência estrutural)

```
Frontend (/treinar) → /api/train/* → withAuth → execOnServer/driver → docker (treino/quant) → Ollama/vLLM (produção)
```

| Camada | Padrão a seguir (já existente) |
|---|---|
| Aba | `src/app/treinar/page.tsx` fino → `src/components/views/treinar.tsx` ("use client") |
| Nav | Entrada em `SERVER_MANAGEMENT_LINKS` (`src/components/nav.tsx`) — só com servidor ativo |
| API | Route handler + zod + `connection()` + `withAuth` (mutação já ganha `guardMutation`) |
| Execução remota | `execOnServer(id)` + comandos de constante ou `shellArg()` — nunca concatenar input da UI |
| Jobs longos | Fila em SQLite → scheduler (1 por vez, 5 s) → progresso em colunas → cancelamento cooperativo → `recoverStale*()` no boot |
| Sigilo | Padrão `safeServer`: `chaveSshPath`/`vllmKey`/HF token nunca em GET |
| UI | `ui.tsx` (PageHeader, Panel, Table, Meter, Segmented, ActionButton), `useLive`, pt-BR |

### Labs vs Produção

| Ambiente | O que é | Onde vive |
|---|---|---|
| **Lab** | Runs de treino, presets, checkpoints, loss ao vivo, comparação de artefatos | `train_jobs` + workspaces `/tmp/icewall-train-{id}` + `/mnt/data` |
| **Produção** | Artefato **promovido e servido**: variante Ollama (padrão Modelfile/`num_ctx` das variantes existentes) ou adapter/GGUF no vLLM — validação de bench antes, rollback depois | `train_artifacts` + models.json (com `.bak`) + snapshot vLLM |

Fluxo em stepper (5 passos já previstos nos docs + 6º de export/promoção):
**Servidor → Modelo base → Dataset → Configuração → Executar/Monitorar → Quantizar/Promover**.

---

## 4. Etapas de execução (uma por sessão)

### T0 — Fundação + limpeza do legado ✅
- Migração Drizzle: `train_jobs` (serverId, ambiente `lab|producao`, presets, lossHistory — substitui `fine_tune_runs`), `train_datasets`, `train_artifacts`.
- Rotas `src/app/api/train/jobs/*` no padrão atual: `withAuth` + zod + `connection()`.
- Removido o `POST /api/fine-tune` legado (rota insegura e quebrada).
- Scheduler: job `train` (espelha `processBenchQueue`) + `recoverStaleTrain()`.
- ✅ **Validação:** typecheck/lint/vitest; GET lista runs; fila marca jobs com falha clara até o runner real (T2).

### T1 — Datasets ✅
- `POST /api/train/datasets` (multipart): conversão para JSONL (chat/text; reconhece messages, Alpaca, prompt/completion, user/assistant, CSV por cabeçalho, TXT), validação (total/duplicados/vazios) e envio pelo driver (`driverFor` + `put`) para `/mnt/data/datasets/{slug}.jsonl`.
- `GET /api/train/datasets` (lista por servidor), `GET/DELETE :id` (remoção bloqueia job na fila/execução), `GET :id/preview` (primeiras N amostras via `head`).
- UI: aba `/treinar` no nav — seletor de servidor do registro, upload drag-and-drop, tabela de datasets, preview e remoção.
- Correção herdada do legado descoberta pelos testes: `shellArg` recusa caminhos absolutos — criado `shellPath` em `spark/ssh.ts` para caminhos.
- ✅ **Validação:** 383/383 testes (32 arquivos), typecheck limpo, lint sem erros novos.

### T2 — Runner real + monitoramento ✅
- **Mandato cumprido (mini-run antes de codar):** imagem `unslothai/unsloth` negada no Docker Hub (tag inexistente/auth) — confirmado que a interface do legado era fictícia. **Plano B (risco 1)**: imagem `icewall-train:latest` derivada da vLLM local no Spark (torch 2.14 + transformers 5.16 + peft/datasets/accelerate), build único de ~1 min.
- **`deploy/train/fine_tune.py` nosso** (não da imagem): LoRA/QLoRA*/full com peft/Trainer, protocolo de marcadores `@@ICW {json}@@` (start/step/done/saved/warning/error) no train.log, adapter salvo em `{out}/adapter`. (*QLoRA exige bitsandbytes — cai para bf16 com aviso; validar na T3.)
- **Runner real** (`src/server/train/runner.ts`): por tick de 5 s — polla o job running (tail do log + marcadores + GPU via compute-apps + final.status) ou inicia o próximo queued (lock não-bloqueante do delegate-local, workspace `/tmp/icewall-train-{id}`, upload do script via driver, nohup + pid, cache HF persistente `$HOME/icewall/hf-cache`); cancelamento limpa container + pid no servidor.
- **SSE** (`GET /api/train/jobs/:id/logs`): ReadableStream + text/event-stream, 2,5 s, encerra no terminal/30 min.
- **UI /treinar**: novo treino (modelo, dataset, método LoRA/QLoRA/full, lab|produção, hiperparâmetros editáveis), fila com progresso, detalhe com curva de loss (recharts), logs ao vivo (EventSource) e stop.
- **Bugs latentes pegos pelo E2E:** `SshDriver.put/get` usava flags de ssh no scp (`-p`/`-l`) e faltava `user@` no destino (nunca exercitado — o bench usa ssh puro); aspas no destino viram literais no scp/SFTP moderno; `/mnt/data` root-only no Spark → datasets em `$HOME/icewall/datasets`; tqdm cola o marcador sem `\n` → parser com match global; scheduler não recebe hot-reload (reinício a cada mudança — já avisado no README).
- ✅ **Validação (E2E real no Spark):** mini-run manual OK; job via fila → `done` com loss final 4,38; segundo job com **loss ao vivo acumulando entre polls** (4 pontos: 4,19→4,15); **stop ao vivo** aos 41% → `cancelled`, container removido, campos limpos. 392/392 testes.

### T3 — Quantização e exports (treinar → quantificar)
- Caminho 1 (no fim do treino): `save_pretrained_gguf` (q4_k_m/q8_0/f16) via Unsloth.
- Caminho 2 (pós-treino, qualquer checkpoint): container llama.cpp (`convert_hf_to_gguf.py` + `llama-quantize`, opcional imatrix com dataset de calibração).
- Tabela `train_artifacts` + UI (lista, tamanho, download via `driver.get()`).
- ✅ **Validação:** GGUF q4_k_m gerado e baixado para a Station.

### T4 — Lab → Produção (promover)
- Promover artifact → variante Ollama (com vínculo de origem, como as variantes existentes) **ou** adapter no vLLM (`--enable-lora --lora-modules`, chave do registro).
- **Portão de qualidade:** bench da variante antes de promover (precedente "Aplicar no models.json", com backup `.bak` e rollback).
- UI: seção Produção com artefatos promovidos, status do serving (snapshots vLLM/Ollama existentes) e rollback.
- ✅ **Validação:** variante treinada aparece em Modelos/serving e no bench.

---

## 5. Checklist de coerência obrigatório

- Rotas novas: `withAuth` (mutações com `guardMutation` automático), zod por rota, `connection()`, erros via `api-errors` (nunca `err.message` cru).
- SSH: comandos constantes + `shellArg()`; nunca concatenar texto vindo da interface.
- Sigilo: `chaveSshPath`/`vllmKey`/HF token (modelos gated) nunca em GET (padrão `safeServer`).
- Testes: contrato por rota nova + **fixture do log de treino** para o parser (precedente `src/server/parsers/fixtures/`).
- GPU compartilhada: aderir ao `withDelegateLock` (treino disputa GPU com delegações/bench).
- Na sessão de implementação, ler os docs relevantes em `node_modules/next/dist/docs/` (mandato do AGENTS.md).
- Commits: `git -c user.name="Junior Almeida" -c user.email="junioralmeidatecnologia@gmail.com" commit ...` com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; UI em pt-BR; nunca imprimir `.env.local` nem chaves.

---

## 6. Riscos

1. **Imagem de treino no DGX Spark (GB10/arm64):** validar com mini-run antes de construir o resto (plano B: imagem PyTorch + TRL/PEFT).
2. **Ollama offline no Spark:** promoção v1 pode precisar ser vLLM-only ou GGUF + download.
3. **Disco:** checkpoints/GGUF crescem rápido — job de limpeza de `/tmp/icewall-train-*` + retenção de artifacts.
4. **SSE + `cacheComponents`:** sempre `connection()` + `no-store` (validado na doc oficial).

---

## 7. Arquivos previstos

| Ação | Caminho |
|---|---|
| Criar | `src/app/treinar/page.tsx`, `src/components/views/treinar.tsx` |
| Criar | `src/app/api/train/jobs/route.ts`, `src/app/api/train/jobs/[id]/route.ts`, `src/app/api/train/jobs/[id]/stop/route.ts`, `src/app/api/train/jobs/schemas.ts`, `src/app/api/train/datasets/**`, `src/app/api/train/artifacts/**` |
| Criar | `src/server/train/{runner,datasets,parse-log,quantize}.ts` (+ fixtures) |
| Criar | `deploy/train/fine_tune.py` (+ Compose/Dockerfile do container de treino/quant) |
| Editar | `src/components/nav.tsx` (link Treinar), `src/server/scheduler.ts` (job `train`), `src/server/db/schema.ts`, migração Drizzle |
| Remover | `src/app/api/fine-tune/route.ts` (legado inseguro) — feito na T0 |
