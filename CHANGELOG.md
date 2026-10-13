# Changelog

Todas as mudanças notáveis deste projeto serão documentadas neste arquivo.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e o projeto adere ao [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [v1.3.0] — 2026-10-13

### 🚀 Adicionado
- Multi-tenant SaaS com PostgreSQL (Tenants/Users/RBAC via Drizzle)
- Auth JWT Edge + 2FA TOTP (<1ms, sem cold start de serverless)
- Painel Admin (/settings): CRUD usuários, reset senha, revogação 2FA
- Matriz RBAC (admin, operator, viewer) — `server/auth/admin.test.ts`
- Trilha de auditoria (`saas_audit_logs`)
- Webhooks de alerta via Discord/Slack/Email
- Shell unificado ao vivo via WebSocket (`/api/terminal/exec`, alvo local ou remoto SSH)
- Painel de servidores com seleção de clusters (Spark local + remotos)
- Health check + métricas do servidor em tempo real
- Pre-roteador preditivo JEV + painel ROI de tokens no auditor
- Redesign tela de modelos: cards + recriação automática de variantes locais
- Redesign visual: tema escuro, paleta neutra, botões arredondados
- Botão "aplicar recomendação" em 1 clique (Crivo)
- Dockerfile otimizado (multi-stage build para produção)
- docker-compose.yml completo: Postgres + Redis + IceWALL em network isolado

### ⚡ Performance
- JWT validação via edge runtime — sem cold start de serverless
- Componentes UI otimizados com memoization (AppShell, NavContext)

### 📝 Documentação
- Instruções de delegação local ao Spark no Copilot (`copilot-instructions.md`)

### 🧪 Testes (4 novas suítes)
- `server/auth/admin.test.ts` — RBAC e funções admin
- `server/auth/auth.test.ts` — JWT + TOTP lifecycle
- `server/actions/recommendation-apply.test.ts` — validação do Crivo pré-apply
- `server/jev/router.test.ts` — regras de roteamento preditivo

---

## [v1.2.0] — 2026-10-10

### 🚀 Adicionado
- **Crivo para todos os projetos** — ganchos saem de settings.local.json e vão para ~/.claude/settings.json
- **Painel Projetos** na aba Crivo: toggle desligar Crivo por projeto
- Descrição automática: do README do cwd, da aba ou nome da pasta
- Notificações do Claude Code passam sem quebrar regra da resposta ao Jev

### 🔧 Mudado
- Drizzle schema: tabela `crivo_projetos` mapeia projetos → regras
- Configuração por projeto estruturado em `src/server/crivo/projetos.ts`

### 📝 Documentação
- Guia completo do Crivo em `docs/crivo/README.md` (regras, hooks, rotas)
- Atualizado README principal e CHANGELOG.md

---

## [v1.1.0] — 2026-10-10

### 📝 Documentação
- Guia completo do Crivo: regras, ganchos (hooks), rotas, dados e histórico
- `docs/crivo/README.md` com pipeline de exemplos passo a passo
- Atualizado README principal e CHANGELOG.md

---

## [v1.0.0] — 2026-10-06

### 🚀 Adicionado
- **IceWALL Dashboard** — painel central com login, server cluster view via Drizzle ORM SQLite
- **Bancada (bench de agentes LLM)** — testes com tarefas progressivas, runner, spark
- **MTP + Nemotron** pipeline embedding e reranker com cache na memória
- **Aba Crivo** — avaliação automática de prompts/agentes (17 regras em `src/server/crivo/`)
- Systemd service para deploy automático em servidores Linux

### 📦 Build & Configuração
- Dockerfile + docker-compose.yml para ambiente de desenvolvimento
- ESLint, TypeScript e Next.js configurados
- Pacotes principais: @ai-sdk/*, ollama, drizzle, bcrypt

---

## Links

| Versão | Link |
|--------|------|
| v1.0.0 → v1.3.0 (current) | [compare](https://github.com/juniortecnologia/icewall/compare/v1.0.0...HEAD) |
| v1.2.0 → HEAD | [compare](https://github.com/juniortecnologia/icewall/compare/v1.2.0...HEAD) |
