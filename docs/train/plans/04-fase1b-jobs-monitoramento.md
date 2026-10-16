# Fase 1B: Jobs de Treinamento + Monitoramento ao Vivo

> **⚠ Superado pelo plano da Fase 2:** [2026-10-15-fase2-treinar-lab-producao.md](2026-10-15-fase2-treinar-lab-producao.md) — jobs vivem em `train_jobs` + `/api/train/jobs` (T0) e o monitoramento real via SSE é a T2. Mantido como contexto histórico.

**Status:** planejamento  
**Prioridade:** MVP — esta é a parte mais importante do pipeline!

---

## Objetivos da Fase 1B

- Criar, iniciar, pausar e monitorar jobs de treinamento via API
- Logs ao vivo (loss, epochs, tempo restante)
- Interface visual com gráfico de loss curve

### Task 0: Endpoints CRUD de Jobs

**Arquivos:** `src/app/api/train/jobs/route.ts`, `tests/jobs.test.ts`

1. **POST `/api/train/jobs`** — Criar job
   ```ts
   // Recebe: servidorId, modeloBaseId, datasetPath, hiperparametros
   // Retorna: { jobId, status: "pending" }
   ```

2. **GET `/api/train/jobs`** — Listar jobs do usuario  
3. **GET `/api/train/jobs/:id/status`** — Status atual (pending/running/completed/paused/failed)  
4. **POST `/api/train/jobs/:id/start/`** — Iniciar job (executa `unsloth train` via SSH no Spark)
5. **POST `/api/train/jobs/:id/pause/`** — Pausar job (SIGSTOP)
6. **DELETE `/api/train/jobs/:id/stop/`** — Cancelar job (SIGTERM + cleanup)

### Task 1: Monitoramento ao vivo

**Arquivos:** `src/app/api/train/jobs/[id]/logs/route.ts`, `src/lib/train/stream-logs.ts`

- **GET `/api/train/jobs/:id/logs?follow=true`** — SSE ou polling
- Captura loss/epoch/timestamp do output do container unsloth e stream no navegador
- UI grafica de Loss curve ao longo das epochs  

### Task 2: Progresso visual (frontend — pra implementar depois)

Fuxo da interface `05-fase2-exports-inference.md`:
1. Usuario vai pra `/treinar`
2. Seleciona servidor → modelo base  
3. Configura dataset + hiperparametros
4. Clica "Treinar" → mostra tela de progresso:
   - Loss por epoch em tempo real 
   - Estimativa tempo restante  
5. Opcao pra pausar e continuar depois
