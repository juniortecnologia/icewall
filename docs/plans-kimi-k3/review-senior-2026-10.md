# Review Sênior do Repositório — 14/10/2026 (v1.4.0)

> Feedback de revisão de código completa do Icewall, feita por IA atuando como dev sênior.
> **Status: backlog** — as recomendações abaixo serão executadas futuramente, em etapas próprias.

---

## 1. Resumo executivo

**Nota geral: 8/10.** Projeto com arquitetura pensada, fases documentadas, testes no núcleo (parsers/lógica) e higiene exemplar (0 `any`, 0 TODO, 0 `console.log` fora de testes). Os pontos críticos concentram-se na **fronteira de segurança** das 38 rotas de API.

---

## 2. Pontos fortes (manter)

1. **Disciplina de commits e documentação** — plano multi-servidor documentado antes da execução (`docs/plano-multi-servidor/`), histórico granular por etapas.
2. **Arquitetura de drivers de servidor** (`src/lib/servers/`) — driver `local`/`ssh` resolvido pelo executor via registro central `servers`. Migração do hardcode do Spark feita por fases.
3. **Parsers com fixtures reais** — 13 fixtures `.txt` de saída SSH em `src/server/parsers/`; jeito certo de testar parsing de output externo.
4. **Higiene de código** — zero `any`, zero TODO/FIXME, zero `console.log` fora de testes; zod, `server-only`, singleton de DB no `globalThis`, WAL + `busy_timeout`.
5. **Anti-CSRF pragmático** — `guardMutation` (header `x-icewall: 1` + origem) adequado para app localhost.
6. **Retenção com amostragem** no scheduler (1/h após 7 dias, por `server_id`) — visão de operação de longo prazo.

---

## 3. Problemas críticos 🔴 (prioridade alta)

### 3.1 Segredo JWT com fallback hardcoded
- **Onde:** `src/server/auth/jwt-edge.ts:10` e `src/server/auth/crypto.ts` — `process.env.JWT_SECRET || "icewall-default-secret-dev-2025-token"`.
- **Risco:** com 2FA, multi-tenant e admin, o fallback anula a segurança em qualquer deploy desatento. `.env.example` nem lista `JWT_SECRET`.
- **Correção proposta:** fail-fast no boot se `JWT_SECRET` ausente (nunca default silencioso); documentar no `.env.example`. Limpar também o `.env.local.bak-*` presente na worktree.

### 3.2 Duas implementações de sessão/JWT coexistindo
- **Onde:** `jwt-edge.ts` (HMAC manual via WebCrypto) vs `crypto.ts` (pacote `jsonwebtoken`).
- **Risco:** duas fontes de verdade para assinatura de token = divergência silenciosa + superfície de ataque dobrada.
- **Correção proposta:** consolidar em uma única (preferência pela WebCrypto/edge) e remover as deps `jsonwebtoken` + `@types/jsonwebtoken`.

### 3.3 Vazamento de erro interno no body das respostas
- **Onde:** helper `json()` em `src/server/api.ts` devolve `err.message` ao cliente no 500; rotas de auth idem.
- **Risco:** expõe paths, comandos SSH e schema interno.
- **Correção proposta:** logar erro completo server-side; devolver mensagem genérica + ID de erro.

### 3.4 Cobertura de testes assimétrica nas rotas
- **Fato:** 209 testes, mas apenas **1 rota de API testada de 38**.
- **Correção proposta:** testes de contrato no mínimo para `auth/*`, `admin/users`, `terminal/exec`, `actions` e rotas que disparam SSH. É onde moram os bugs de segurança.

### 3.5 Validação de input inconsistente
- **Fato:** 18 rotas leem `req.json()`, só ~7 usam zod; login valida na mão.
- **Correção proposta:** schema zod por rota como padrão obrigatório.

---

## 4. Sugestões estruturais 🟡 (prioridade média)

1. **Páginas gigantes** — `settings/page.tsx` (1080 linhas) e `servers/page.tsx` (728): quebrar em sub-componentes por seção.
2. **`docker/init-db.sql` (PostgreSQL) é código morto** — o TS usa só SQLite; tabelas `saas_*` já portadas. Remover ou documentar como "plano SaaS futuro". Idem `pg` + `@types/pg` nas deps.
3. **Lacuna nas migrações** — `drizzle/` pula 0007/0008 (rename do fine-tune). Nota no README do drizzle ou renumeração para fechar a sequência.
4. **Auth descentralizada por rota** — `requireAuth()` espalhado lançando `Error("Unauthorized")`, convertido em 401 por cada handler; uma rota nova esquecida vira endpoint aberto. Introduzir wrapper `withAuth(handler)` que centralize auth + mapeamento de erros + `guardMutation`.
5. **Organização da raiz** — consolidar `testers/` (1 arquivo) na estrutura de testes padrão; agrupar `scripts/` por propósito.
6. **CobeSQL cru** — ~6 ocorrências de `sql\`\`` fora de `queries.ts`/`scheduler.ts`; revisar projeções.

---

## 5. Plano de execução sugerido (quando retomarmos)

| Etapa | Escopo | Itens | Esforço estimado |
|-------|--------|-------|------------------|
| **S1 — Segurança de segredos** | Fail-fast `JWT_SECRET`, `.env.example`, limpeza de `.bak` | 3.1 | ~1h |
| **S2 — Consolidação do JWT** | Uma implementação só, remover `jsonwebtoken` | 3.2 | ~2h |
| **S3 — Higiene de erros nas APIs** | Resposta genérica de 500 + ID de erro | 3.3 | ~2h |
| **S4 — Auth centralizada** | Wrapper `withAuth` + zod obrigatório nas rotas | 3.5, 4.4 | ~4h |
| **S5 — Testes de rotas críticas** | Contratos de auth/admin/exec/actions | 3.4 | ~4h |
| **S6 — Limpeza estrutural** | init-db.sql, lacuna migrations, quebra de páginas | 4.1–4.3, 4.5 | ~4h |

> S1–S3 resolvem os itens críticos em ~5h de trabalho focado.

---

## 6. Referências internas

- Schema: `src/server/db/schema.ts` (24 tabelas, SQLite via better-sqlite3)
- Rotas de API: `src/app/api/**` (38 rotas)
- Helpers de API: `src/server/api.ts` (`json()`, `guardMutation()`)
- Auth: `src/server/auth/{jwt-edge,crypto,session,totp}.ts`
- Testes: vitest, `vitest.config.ts` (24 arquivos, ~209 asserções)
