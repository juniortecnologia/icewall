# Integração ICEWALL

## Como a skill `qwen-delegar` se conecta ao ICEWALL

### Endpoint `/api/delegations` (POST) — Registros de Delegação

A skill `qwen-delegar` envia delegações ao painel ICEWALL via HTTP POST:

```bash
curl -X POST http://localhost:4310/api/delegations \
  -H "Content-Type: application/json" \
  -d '{
    "type": "run",
    "run_id": "uuid-v4-aqui",
    "ts": "2026-10-13T15:00:00.000Z",
    "workdir": "/home/junior/Projects/meu-projeto",
    "label": "qwen-delegar",
    "tier": "fast",
    "model": "Qwen3.6-35B-A3B",
    "exit_code": 0,
    "duration_s": 42.5,
    "rounds": 1,
    "tests_passed": true,
    "eval_tokens": 1250,
    "tok_s": 120,
    "files": ["src/app/page.tsx"],
    "message": "Arquivo criado com sucesso"
  }'
```

**Exemplo completo:**

```bash
curl -X POST http://localhost:4310/api/delegations \
  -H "Content-Type: application/json" \
  -d '{
    "type": "run",
    "run_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "ts": "2026-10-13T15:00:00.000Z",
    "workdir": "/home/junior/Projects/meu-projeto",
    "label": "qwen-delegar",
    "tier": "quality",
    "model": "gemma4:26b",
    "exit_code": 0,
    "duration_s": 125.3,
    "rounds": 3,
    "max_rounds": 5,
    "tests_passed": true,
    "eval_tokens": 5420,
    "prompt_tokens": 2100,
    "tok_s": 180,
    "context_count": 47,
    "files": ["src/app/api/auth/login/route.ts", "src/server/crivo/decisao.ts"],
    "message": "Autenticação JWT e Crivo atualizados conforme regras"
  }'
```

### Endpoint de Revisão (POST para /api/delegations)

```bash
curl -X POST http://localhost:4310/api/delegations \
  -H "Content-Type: application/json" \
  -d '{
    "type": "review",
    "run_id": "mesmo-uuid-do-run",
    "ts": "2026-10-13T15:05:00.000Z",
    "verdict": "accepted"
  }'
```

### Campos aceitos pelo POST

| Campo | Obrigatório | Descrição |
|-------|-------------|-----------|
| `type` | ✅ | `"run"` ou `"review"` |
| `run_id` | ✅ | UUID v4 — usado para deduplicação (idempotente) |
| `ts` | ✅ | Timestamp ISO 8601 |
| `exit_code` | ✅ run | Código de saída do task runner |
| `workdir` | — | Working directory da execução |
| `label` | — | Identificador do agente (ex: `"qwen-delegar"`, `"claude-code"`) |
| `tier` | — | `"fast"`, `"quality"` ou `"custom"` |
| `model` | — | Modelo usado na inferência |
| `duration_s` | — | Duração em segundos |
| `rounds` | — | Número de rodadas do agente |
| `tests_passed` | — | Se testes passaram |
| `eval_tokens` | — | Tokens gerados para avaliação |
| `tok_s` | — | Tokens por segundo (velocidade) |
| `test_cmd` | — | Comando de teste executado |
| `files` | — | Array de arquivos modificados/criados |
| `message` | — | Mensagem de status da execução |

### Acesso ao Painel

A skill `qwen-delegar` tem acesso total a todas as views do ICEWALL. Ao iniciar uma tarefa, a skill:

1. Pode consultar `/api/delegations?days=7` para contexto de delegações recentes
2. Executa a delegação no modelo local via Spark/Ollama ou remoto via MCP (`spark-models`)
3. Envia o resultado via POST para `/api/delegations` com payload do tipo `"run"` ou `"review"`

### Painéis disponíveis do ICEWALL

| Rota | Painel | Descrição |
|------|--------|-----------|
| `/` | Overview | Visão geral, KPIs e saúde do sistema |
| `/auditor` | Auditor | Crivo universal + ROI de tokens (JEV) |
| `/crivo` | Crivo | Regras, ganchos (hooks), avaliações automáticas |
| `/actions` | Ações | Recomendações aplicáveis, workflow de aprovação |
| `/delegations` | Delegações | Execuições de delegação, vereditos e métricas |
| `/models` | Modelos | Gestão de modelos locais e variantes |
| `/tokens` | Tokens | Uso e custo de tokens (ingestão Claude API) |
| `/spark` | Spark | Status dos servidores locais e GPUs |
| `/bancada` | Bancada | Benchmarks comparativos de modelos |
| `/containers` | Containers | Gerenciamento Docker |
| `/settings` | Admin/Settings | CRUD usuários, RBAC, backup, 2FA, webhooks |
| `/system` | System Health | Métricas do servidor em tempo real |

## Como adicionar um novo agente ao ICEWALL

Para que um agente OpenCode possa enviar delegações:

1. Configurar o `base_url` para o ICEWALL (se estiver em outro host)
2. Usar o endpoint POST acima no formato especificado
3. O campo `label` do payload identifica o agente (ex: `"qwen-delegar"`, `"claude-code"`)

## Como a qwen-delegar chama o ICEWALl ao executar

```
qwen-delegar skill (OpenCode)
  │
  ├─► Recebe tarefa do usuário
  │
  ├─► Decidir tier de modelo (fast/quality/custom)
  │     └─ Consulta /api/delegations?days=1 se disponível para contexto
  │
  ├─► Executa no modelo local (spark-models MCP ou Ollama direto)
  │
  ├─► Gera resultado dos testes
  │
  └─► Envia ao ICEWALL: POST /api/delegations { type:"run", ... }
```

## Como remover/desabilitar a integração

1. No `opencode.json`, remover a referência aoICEWALL ou configurar `"enabled": false`
2. Ou configurar `ICEWALL_URL=` vazio no `.env`
3. Ou remover o endpoint `/api/delegations` POST do repositório
