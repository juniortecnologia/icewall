# Crivo — Painel dos dois portões (etapa 1) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** um painel em Next.js, rodando em `localhost:4000`, com placar e duas colunas de feed ao vivo (portão de entrada e portão de saída). Os dados de mentira ficam no SQLite, e há um botão "simular" e um indicador da chave TypeSafe.

**Architecture:**
- Uma camada de dados em `src/lib/` (tipos, regras puras, SQLite via `better-sqlite3`, exemplos, simulador), testada com Vitest.
- Duas rotas de API (`GET /api/feed`, `POST /api/simular`).
- Uma página servidor que entrega o primeiro feed já pronto ao componente cliente `Painel`, que consulta `/api/feed` a cada 2 segundos.
- Componentes visuais pequenos, um por arquivo, com todos os ícones em SVG à mão em `icones.tsx`.

**Tech Stack:**
- Next.js 16.4 (App Router), React 19, TypeScript, Tailwind CSS 4.
- `better-sqlite3` 13, Vitest 5.
- `corepack pnpm` (pnpm 12).

**Spec:** `docs/superpowers/specs/2026-10-06-crivo-painel-design.md`

## Global Constraints

- O projeto fica em `/home/junior/Projects/crivo`, com git próprio. Todo o trabalho é na branch `developer`. Nunca mesclar na `main`, nunca dar push, nunca abrir PR.
- `pnpm` não está no PATH: use sempre `corepack pnpm …`.
- Porta fixa: `dev` = `next dev -p 4000`, `start` = `next start -p 4000`. Nunca trocar de porta automaticamente.
- Sem emoji, sem biblioteca de ícones, sem imagem externa. Logo e ícones são SVG escritos à mão no código. O favicon é `src/app/icon.svg`.
- `.env.local` na raiz contém exatamente `TYPESAFE_API_KEY=` (vazia) e é ignorado pelo git. O navegador nunca recebe o valor da chave, só um booleano.
- Semáforo da entrada: **nota ≥ 70 verde, 40–69 amarelo, < 40 vermelho**, sempre calculado (`semaforoDaNota`).
- Semáforo da saída: `segurado` se tem regra, `liberado` se não tem (`semaforoDoComando`).
- Barrinhas medem qualidade (100% = ótimo). A exceção é o tamanho, que é uma escala com a classe escrita e fica em alerta quando é `sistema`. "Mistura várias coisas" aparece como "Foco num assunto só".
- Exemplos obrigatórios na entrada: `faz uns relatórios aí` vermelho e um pedido de relatório detalhado verde. São cerca de 10 itens por coluna.
- Feeds limitados aos 50 itens mais recentes. O placar conta o banco inteiro.
- O horário é sempre formatado com `timeZone: "America/Sao_Paulo"`, para o servidor e o navegador gerarem o mesmo texto (sem erro de hidratação).
- Commits com a identidade git global e a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Textos da interface em português do Brasil.

## Review Focus

1. **Texto com aspas, `;`, `--` ou HTML** (`'; DROP TABLE prompts; --`, `<b>oi</b>`): precisa ser gravado e lido exatamente igual, sem quebrar o SQL nem virar HTML. Teste na Task 3.
2. **Prompt ou caminho enorme sem espaços:** precisa quebrar dentro da coluna, sem rolagem horizontal. O simulador tem um modelo assim (Task 4), e a verificação é feita no navegador (Task 8).
3. **Chave só com espaços** (`TYPESAFE_API_KEY="   "`): precisa mostrar "sem chave". Teste na Task 2.
4. **Reiniciar o servidor com o banco já cheio:** não pode duplicar os exemplos. Teste na Task 3.
5. **Cliques rápidos em "simular" junto com a consulta de 2 s:** uma resposta mais antiga não pode sobrescrever uma mais nova. O `Painel` usa um contador de sequência (Task 7), e isso é verificado no navegador (Task 8).

---

## Mapa de arquivos

```
package.json, pnpm-workspace.yaml, next.config.ts, vitest.config.ts, .env.local, .gitignore
src/app/layout.tsx            fontes, metadados, <html lang="pt-BR">
src/app/globals.css           tema de sala de controle (tokens Tailwind v4, animações)
src/app/icon.svg              favicon (o logo)
src/app/page.tsx              servidor: lê o feed e a chave, renderiza <Painel>
src/app/api/feed/route.ts     GET → Feed
src/app/api/simular/route.ts  POST → grava um item sorteado e devolve o Feed
src/lib/tipos.ts              tipos compartilhados
src/lib/avaliacao.ts          semaforoDaNota, calcularNota, semaforoDoComando, limitarPct
src/lib/ambiente.ts           chaveCarregada
src/lib/hora.ts               formatarHora
src/lib/exemplos.ts           REGRAS, exemplosPrompts, exemplosComandos
src/lib/db.ts                 abrirBanco, banco, inserirPrompt, inserirComando, lerFeed, lerPlacar
src/lib/simulador.ts          sortearItem, gravarItem
src/components/icones.tsx     todos os SVGs
src/components/Semaforo.tsx   SemaforoEntrada, SemaforoSaida, COR_ENTRADA, COR_SAIDA, ROTULO_ENTRADA
src/components/BarraCriterio.tsx
src/components/ItemPrompt.tsx
src/components/ItemComando.tsx
src/components/Coluna.tsx
src/components/Placar.tsx
src/components/Rodape.tsx
src/components/Painel.tsx     cliente: consulta, simular, abas no celular
tests/*.test.ts               Vitest (ambiente node)
```

---

### Task 1: Esqueleto do projeto (Next 16 + Tailwind + Vitest + better-sqlite3, porta 4000)

**Files:**
- Create: o projeto inteiro gerado pelo `create-next-app`, mais `vitest.config.ts`, `.env.local` e `tests/sanidade.test.ts`
- Modify: `package.json` (scripts), `.gitignore`, `next.config.ts`
- Delete: `public/*.svg`, `src/app/favicon.ico`

**Interfaces:**
- Produces: scripts `dev`, `build`, `start`, `lint`, `typecheck`, `test`; alias `@/` → `src/` (no Next e no Vitest)

- [ ] **Step 1: Gerar o projeto base no scratchpad** (a pasta `crivo` já tem `.git` e `docs/`, então não dá para gerar direto nela)

```bash
SCRATCH=/tmp/claude-1000/-home-junior-Projects-happy-team-chat/836e4a67-6963-4cfa-85d4-f9f7bd3ba9c2/scratchpad
cd "$SCRATCH" && rm -rf crivo-base && corepack pnpm dlx create-next-app@16.4.0 crivo-base \
  --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm --skip-install --yes
```

Esperado: a pasta `crivo-base/` com `src/app/page.tsx`, `package.json` e `eslint.config.mjs`.

- [ ] **Step 2: Copiar para `crivo` sem apagar `.git` nem `docs/`**

```bash
SCRATCH=/tmp/claude-1000/-home-junior-Projects-happy-team-chat/836e4a67-6963-4cfa-85d4-f9f7bd3ba9c2/scratchpad
rsync -a --exclude .git --exclude node_modules "$SCRATCH/crivo-base/" /home/junior/Projects/crivo/
cd /home/junior/Projects/crivo && printf '\n# banco local do Crivo\n/data/\n' >> .gitignore
rm -f public/*.svg src/app/favicon.ico
git status --short
```

Esperado: o `.gitignore` do Next (que já ignora `.env*`) mais `/data/`, e `docs/` intacta.

- [ ] **Step 3: Scripts com porta fixa.** Em `package.json`, deixar `scripts` exatamente assim:

```json
"scripts": {
  "dev": "next dev -p 4000",
  "build": "next build",
  "start": "next start -p 4000",
  "lint": "eslint",
  "typecheck": "tsc --noEmit",
  "test": "vitest run"
}
```

- [ ] **Step 4: Instalar dependências e liberar o build nativo**

```bash
cd /home/junior/Projects/crivo
corepack pnpm install
corepack pnpm add better-sqlite3@13.0.3
corepack pnpm add -D @types/better-sqlite3 vitest@5.0.3
corepack pnpm approve-builds better-sqlite3
```

Se o binário não aparecer depois de aprovar, rode `corepack pnpm rebuild better-sqlite3`. Confira que `pnpm-workspace.yaml` registrou a aprovação de `better-sqlite3`.

- [ ] **Step 5: `next.config.ts`**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // driver nativo do SQLite: fica fora do bundle do servidor
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
```

- [ ] **Step 6: `vitest.config.ts`**

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 7: `.env.local`** (uma linha, ignorada pelo git)

```
TYPESAFE_API_KEY=
```

- [ ] **Step 8: Teste de sanidade do SQLite nativo.** Arquivo `tests/sanidade.test.ts`:

```ts
import Database from "better-sqlite3";
import { expect, it } from "vitest";

it("abre um SQLite em memória", () => {
  const db = new Database(":memory:");
  expect(db.prepare("SELECT 1 AS um").get()).toEqual({ um: 1 });
});
```

Run: `corepack pnpm test`
Esperado: 1 teste passando. Se falhar com "Could not locate the bindings file", o build nativo não rodou e é preciso voltar ao Step 4.

- [ ] **Step 9: Confirmar a porta.** Rode `corepack pnpm dev` em segundo plano e depois `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4000`. Esperado: `200`. Pare o servidor (só o processo que você iniciou).

- [ ] **Step 10: Commit**

```bash
cd /home/junior/Projects/crivo && git check-ignore -q .env.local && git check-ignore -q data/x || { echo "ERRO: .env.local ou data/ não estão ignorados"; exit 1; }
git add -A && git commit -m "Monta o esqueleto do Crivo: Next 16, Tailwind, Vitest e SQLite na porta 4000

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Tipos e regras puras (semáforo, nota, chave, hora)

**Files:**
- Create: `src/lib/tipos.ts`, `src/lib/avaliacao.ts`, `src/lib/ambiente.ts`, `src/lib/hora.ts`
- Test: `tests/avaliacao.test.ts`, `tests/ambiente-hora.test.ts`

**Interfaces:**
- Produces:
  - `type Semaforo = "verde" | "amarelo" | "vermelho"`
  - `type Tamanho = "ajuste" | "funcionalidade" | "sistema"`
  - `type TipoAlvo = "comando" | "arquivo"`
  - `type SemaforoSaida = "liberado" | "segurado"`
  - `interface Criterios`, `Prompt`, `Comando`, `Placar`, `Feed`
  - `type NovoPrompt = Omit<Prompt, "id" | "semaforo">`
  - `type NovoComando = Omit<Comando, "id" | "semaforo">`
  - `semaforoDaNota(nota: number): Semaforo`
  - `calcularNota(c: Criterios): number`
  - `semaforoDoComando(regra: string | null): SemaforoSaida`
  - `limitarPct(n: number): number`
  - `chaveCarregada(valor: string | undefined): boolean`
  - `formatarHora(iso: string): string`

- [ ] **Step 1: `src/lib/tipos.ts`**

```ts
export type Semaforo = "verde" | "amarelo" | "vermelho";
export type Tamanho = "ajuste" | "funcionalidade" | "sistema";
export type TipoAlvo = "comando" | "arquivo";
export type SemaforoSaida = "liberado" | "segurado";

/** Os cinco critérios do portão de entrada, de 0 a 100. */
export interface Criterios {
  tamanho: Tamanho;
  /** Escala do tamanho: 0 = ajuste mínimo, 100 = sistema inteiro. */
  tamanhoPct: number;
  objetivoPct: number;
  ondePct: number;
  prontoPct: number;
  /** Foco num assunto só: baixo = mistura várias coisas. */
  focoPct: number;
}

export interface Prompt {
  id: number;
  texto: string;
  criadoEm: string;
  criterios: Criterios;
  nota: number;
  semaforo: Semaforo;
}

export interface Comando {
  id: number;
  criadoEm: string;
  tipo: TipoAlvo;
  alvo: string;
  regra: string | null;
  semaforo: SemaforoSaida;
}

export interface Placar {
  passaram: number;
  perguntas: number;
  barrados: number;
  segurados: number;
}

export interface Feed {
  prompts: Prompt[];
  comandos: Comando[];
  placar: Placar;
}

export type NovoPrompt = Omit<Prompt, "id" | "semaforo">;
export type NovoComando = Omit<Comando, "id" | "semaforo">;
```

- [ ] **Step 2: Escrever os testes que devem falhar.** Arquivo `tests/avaliacao.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { calcularNota, limitarPct, semaforoDaNota, semaforoDoComando } from "@/lib/avaliacao";
import type { Criterios } from "@/lib/tipos";

const criterios = (o: number, w: number, p: number, f: number): Criterios => ({
  tamanho: "funcionalidade",
  tamanhoPct: 50,
  objetivoPct: o,
  ondePct: w,
  prontoPct: p,
  focoPct: f,
});

describe("semaforoDaNota", () => {
  it.each([
    [0, "vermelho"],
    [39, "vermelho"],
    [40, "amarelo"],
    [69, "amarelo"],
    [70, "verde"],
    [100, "verde"],
  ] as const)("nota %i → %s", (nota, cor) => {
    expect(semaforoDaNota(nota)).toBe(cor);
  });
});

describe("calcularNota", () => {
  it("tudo 100 dá 100 e tudo 0 dá 0", () => {
    expect(calcularNota(criterios(100, 100, 100, 100))).toBe(100);
    expect(calcularNota(criterios(0, 0, 0, 0))).toBe(0);
  });
  it("pesa objetivo 30%, onde 20%, pronto 25%, foco 25%", () => {
    expect(calcularNota(criterios(100, 0, 0, 0))).toBe(30);
    expect(calcularNota(criterios(0, 100, 0, 0))).toBe(20);
    expect(calcularNota(criterios(0, 0, 100, 0))).toBe(25);
    expect(calcularNota(criterios(0, 0, 0, 100))).toBe(25);
  });
  it("o tamanho não entra na nota", () => {
    const a = calcularNota({ ...criterios(80, 80, 80, 80), tamanho: "ajuste", tamanhoPct: 5 });
    const b = calcularNota({ ...criterios(80, 80, 80, 80), tamanho: "sistema", tamanhoPct: 95 });
    expect(a).toBe(b);
  });
});

describe("semaforoDoComando", () => {
  it("sem regra é liberado; com regra é segurado", () => {
    expect(semaforoDoComando(null)).toBe("liberado");
    expect(semaforoDoComando("   ")).toBe("liberado");
    expect(semaforoDoComando("Nada de DROP")).toBe("segurado");
  });
});

describe("limitarPct", () => {
  it("prende entre 0 e 100 e arredonda", () => {
    expect(limitarPct(-5)).toBe(0);
    expect(limitarPct(130)).toBe(100);
    expect(limitarPct(41.6)).toBe(42);
  });
});
```

Arquivo `tests/ambiente-hora.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { chaveCarregada } from "@/lib/ambiente";
import { formatarHora } from "@/lib/hora";

describe("chaveCarregada", () => {
  it("vazia, ausente ou só espaços = sem chave", () => {
    expect(chaveCarregada(undefined)).toBe(false);
    expect(chaveCarregada("")).toBe(false);
    expect(chaveCarregada("   ")).toBe(false);
  });
  it("qualquer valor real = carregada", () => {
    expect(chaveCarregada("ts_abc123")).toBe(true);
  });
});

describe("formatarHora", () => {
  it("usa sempre o horário de Brasília, com segundos", () => {
    expect(formatarHora("2026-10-06T15:04:05.000Z")).toBe("12:04:05");
  });
});
```

- [ ] **Step 3: Rodar os testes e ver que falham.** Run: `corepack pnpm test`. Esperado: FAIL com "Failed to resolve import" de `@/lib/avaliacao`, `@/lib/ambiente` e `@/lib/hora`.

- [ ] **Step 4: Implementar.** Arquivo `src/lib/avaliacao.ts`:

```ts
import type { Criterios, Semaforo, SemaforoSaida } from "./tipos";

export const NOTA_VERDE = 70;
export const NOTA_AMARELO = 40;

export function limitarPct(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)));
}

/** A cor nunca é escolhida à mão: sai sempre da nota. */
export function semaforoDaNota(nota: number): Semaforo {
  if (nota >= NOTA_VERDE) return "verde";
  if (nota >= NOTA_AMARELO) return "amarelo";
  return "vermelho";
}

/** Nota de 0 a 100 a partir dos critérios de qualidade (o tamanho fica de fora). */
export function calcularNota(c: Criterios): number {
  return limitarPct(0.3 * c.objetivoPct + 0.2 * c.ondePct + 0.25 * c.prontoPct + 0.25 * c.focoPct);
}

/** Bateu numa regra da casa = segurado. */
export function semaforoDoComando(regra: string | null): SemaforoSaida {
  return regra?.trim() ? "segurado" : "liberado";
}
```

Arquivo `src/lib/ambiente.ts`:

```ts
/** Diz só se a chave existe. O valor nunca sai do servidor. */
export function chaveCarregada(valor: string | undefined): boolean {
  return Boolean(valor?.trim());
}
```

Arquivo `src/lib/hora.ts`:

```ts
// Fuso fixo: o servidor e o navegador geram o mesmo texto, sem erro de hidratação.
const formato = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "America/Sao_Paulo",
});

export function formatarHora(iso: string): string {
  return formato.format(new Date(iso));
}
```

- [ ] **Step 5: Rodar os testes e ver que passam.** Run: `corepack pnpm test`. Esperado: todos PASS.

- [ ] **Step 6: Commit**

```bash
cd /home/junior/Projects/crivo && git add src/lib tests && git commit -m "Regras puras do Crivo: nota, semáforos, chave e hora

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Banco SQLite e exemplos

**Files:**
- Create: `src/lib/exemplos.ts`, `src/lib/db.ts`
- Test: `tests/db.test.ts`

**Interfaces:**
- Consumes: `tipos.ts`; `semaforoDaNota`, `semaforoDoComando`, `calcularNota` (Task 2)
- Produces:
  - `REGRAS` (objeto de strings)
  - `exemplosPrompts: ExemploPrompt[]`, `exemplosComandos: ExemploComando[]`
  - `type Banco`
  - `abrirBanco(caminho: string, agora?: number): Banco`
  - `banco(): Banco`, que lê `process.env.CRIVO_DB`; o padrão é `data/crivo.db`
  - `inserirPrompt(db, p: NovoPrompt): Prompt`
  - `inserirComando(db, c: NovoComando): Comando`
  - `lerFeed(db, limite = 50): Feed`
  - `lerPlacar(db): Placar`

- [ ] **Step 1: `src/lib/exemplos.ts`**

A nota de cada exemplo sai de `calcularNota`, e a cor sai da nota. Os critérios abaixo foram escolhidos para dar 5 verdes, 3 amarelos e 3 vermelhos.

```ts
import type { Criterios, Tamanho, TipoAlvo } from "./tipos";

export interface ExemploPrompt {
  texto: string;
  criterios: Criterios;
  minutosAtras: number;
}

export interface ExemploComando {
  tipo: TipoAlvo;
  alvo: string;
  regra: string | null;
  minutosAtras: number;
}

export const REGRAS = {
  rmRf: "Nunca apagar com rm -rf fora de /tmp",
  pushForce: "Nunca reescrever o histórico com git push --force",
  env: "Não ler nem editar arquivos .env",
  drop: "Nada de DROP ou TRUNCATE no banco",
  pacote: "Não instalar pacote novo sem pedir",
  scriptRemoto: "Não executar script baixado da internet",
  semTeste: "Não pular os testes com --no-verify",
} as const;

const c = (
  tamanho: Tamanho,
  tamanhoPct: number,
  objetivoPct: number,
  ondePct: number,
  prontoPct: number,
  focoPct: number,
): Criterios => ({ tamanho, tamanhoPct, objetivoPct, ondePct, prontoPct, focoPct });

export const exemplosPrompts: ExemploPrompt[] = [
  { texto: "faz uns relatórios aí", criterios: c("sistema", 80, 10, 5, 0, 30), minutosAtras: 2 },
  {
    texto:
      "Cria a página /admin/relatorios/vendas-mensais (src/app/admin/relatorios) com uma tabela de vendas por mês dos últimos 12 meses, lendo da tabela pedidos só com status = 'pago': total, ticket médio e quantidade de pedidos. Adiciona um botão \"Exportar CSV\". Pronto quando: os números batem com a consulta SQL do ticket #142, o CSV abre no Excel com acentos certos e os testes em src/lib/relatorios passam.",
    criterios: c("funcionalidade", 50, 95, 92, 95, 90),
    minutosAtras: 5,
  },
  {
    texto:
      "corrige o botão Salvar do formulário de contato (src/components/FormContato.tsx): ele não desabilita enquanto envia. Pronto quando não der para clicar duas vezes e mandar dois e-mails.",
    criterios: c("ajuste", 15, 90, 95, 85, 100),
    minutosAtras: 8,
  },
  { texto: "melhora a performance do app", criterios: c("sistema", 85, 25, 10, 10, 40), minutosAtras: 11 },
  {
    texto: "adiciona login com Google e já aproveita e muda as cores do tema e arruma aquele bug do carrinho",
    criterios: c("funcionalidade", 60, 55, 30, 15, 10),
    minutosAtras: 14,
  },
  {
    texto: "cria uma tela de cadastro de clientes com nome, e-mail e telefone",
    criterios: c("funcionalidade", 45, 75, 40, 30, 90),
    minutosAtras: 17,
  },
  {
    texto: "troca o texto do rodapé de '© 2025' para '© 2026' em src/components/Rodape.tsx",
    criterios: c("ajuste", 5, 100, 100, 90, 100),
    minutosAtras: 21,
  },
  {
    texto: "refatora o módulo de pagamentos pra ficar mais limpo",
    criterios: c("funcionalidade", 55, 40, 60, 15, 80),
    minutosAtras: 25,
  },
  {
    texto: "adiciona paginação na lista de pedidos (src/app/pedidos/page.tsx), 20 por página, mantendo o filtro de status na URL",
    criterios: c("funcionalidade", 35, 85, 90, 50, 95),
    minutosAtras: 29,
  },
  {
    texto: "monta um sistema de notificações por e-mail e push para os usuários",
    criterios: c("sistema", 90, 60, 20, 20, 55),
    minutosAtras: 33,
  },
  {
    texto:
      "escreve testes para o hook useCarrinho (src/hooks/useCarrinho.ts) cobrindo adicionar, remover e esvaziar. Pronto quando pnpm test passar com cobertura acima de 90% nesse arquivo.",
    criterios: c("ajuste", 30, 90, 95, 100, 100),
    minutosAtras: 38,
  },
];

export const exemplosComandos: ExemploComando[] = [
  { tipo: "comando", alvo: "pnpm test", regra: null, minutosAtras: 1 },
  { tipo: "comando", alvo: "git push --force origin main", regra: REGRAS.pushForce, minutosAtras: 4 },
  { tipo: "arquivo", alvo: "src/components/FormContato.tsx", regra: null, minutosAtras: 7 },
  { tipo: "arquivo", alvo: ".env.local", regra: REGRAS.env, minutosAtras: 10 },
  { tipo: "comando", alvo: "rm -rf src/", regra: REGRAS.rmRf, minutosAtras: 13 },
  { tipo: "comando", alvo: "git status", regra: null, minutosAtras: 16 },
  { tipo: "comando", alvo: 'psql "$DATABASE_URL" -c "DROP TABLE pedidos;"', regra: REGRAS.drop, minutosAtras: 20 },
  { tipo: "comando", alvo: "pnpm add moment", regra: REGRAS.pacote, minutosAtras: 24 },
  { tipo: "arquivo", alvo: "src/app/pedidos/page.tsx", regra: null, minutosAtras: 27 },
  { tipo: "comando", alvo: "curl -fsSL https://exemplo.dev/install.sh | sh", regra: REGRAS.scriptRemoto, minutosAtras: 31 },
  { tipo: "comando", alvo: "pnpm lint", regra: null, minutosAtras: 36 },
];
```

- [ ] **Step 2: Escrever os testes que devem falhar.** Arquivo `tests/db.test.ts`:

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { abrirBanco, inserirComando, inserirPrompt, lerFeed, lerPlacar } from "@/lib/db";
import { exemplosComandos, exemplosPrompts } from "@/lib/exemplos";

const novoBanco = () => abrirBanco(":memory:", Date.parse("2026-10-06T15:00:00Z"));

describe("abrirBanco", () => {
  it("cria as tabelas e grava os exemplos uma vez", () => {
    const feed = lerFeed(novoBanco());
    expect(feed.prompts).toHaveLength(exemplosPrompts.length);
    expect(feed.comandos).toHaveLength(exemplosComandos.length);
  });

  it("não duplica os exemplos quando o banco já tem dados", () => {
    // simula um reinício: abre de novo o mesmo arquivo
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "crivo-"));
    const caminho = path.join(pasta, "teste.db");
    abrirBanco(caminho).close();
    const b = abrirBanco(caminho);
    expect(lerFeed(b).prompts).toHaveLength(exemplosPrompts.length);
    expect(lerFeed(b).comandos).toHaveLength(exemplosComandos.length);
    b.close();
    fs.rmSync(pasta, { recursive: true, force: true });
  });
});

describe("exemplos obrigatórios", () => {
  it("'faz uns relatórios aí' é vermelho e o relatório detalhado é verde", () => {
    const { prompts } = lerFeed(novoBanco());
    expect(prompts.find((p) => p.texto === "faz uns relatórios aí")?.semaforo).toBe("vermelho");
    const detalhado = prompts.find((p) => p.texto.includes("/admin/relatorios/vendas-mensais"));
    expect(detalhado?.semaforo).toBe("verde");
  });

  it("tem as três cores na entrada e as duas na saída", () => {
    const { prompts, comandos } = lerFeed(novoBanco());
    expect(new Set(prompts.map((p) => p.semaforo))).toEqual(new Set(["verde", "amarelo", "vermelho"]));
    expect(new Set(comandos.map((c) => c.semaforo))).toEqual(new Set(["liberado", "segurado"]));
  });

  it("todo comando segurado tem regra e todo liberado não tem", () => {
    for (const c of lerFeed(novoBanco()).comandos) {
      expect(c.semaforo === "segurado").toBe(c.regra !== null);
    }
  });
});

describe("lerFeed", () => {
  it("devolve o mais novo primeiro", () => {
    const { prompts, comandos } = lerFeed(novoBanco());
    const ordenado = (xs: { criadoEm: string }[]) =>
      xs.every((x, i) => i === 0 || xs[i - 1].criadoEm >= x.criadoEm);
    expect(ordenado(prompts)).toBe(true);
    expect(ordenado(comandos)).toBe(true);
  });

  it("respeita o limite de itens", () => {
    const { prompts, comandos } = lerFeed(novoBanco(), 3);
    expect(prompts).toHaveLength(3);
    expect(comandos).toHaveLength(3);
  });
});

describe("inserção", () => {
  it("calcula o semáforo e grava texto perigoso sem mudar nada", () => {
    const db = novoBanco();
    const texto = `'; DROP TABLE prompts; -- <b>oi</b> "aspas"`;
    const p = inserirPrompt(db, {
      texto,
      criadoEm: "2026-10-06T16:00:00.000Z",
      nota: 39,
      criterios: { tamanho: "ajuste", tamanhoPct: 10, objetivoPct: 50, ondePct: 50, prontoPct: 20, focoPct: 30 },
    });
    expect(p.semaforo).toBe("vermelho");
    expect(lerFeed(db).prompts[0]).toEqual(p);

    const c = inserirComando(db, {
      tipo: "comando",
      alvo: `echo '$(rm -rf /)'`,
      regra: "Nunca apagar com rm -rf fora de /tmp",
      criadoEm: "2026-10-06T16:00:01.000Z",
    });
    expect(c.semaforo).toBe("segurado");
    expect(lerFeed(db).comandos[0]).toEqual(c);
  });
});

describe("lerPlacar", () => {
  it("conta o banco inteiro, não só o que aparece no feed", () => {
    const db = novoBanco();
    const antes = lerPlacar(db);
    expect(antes).toEqual({ passaram: 5, perguntas: 3, barrados: 3, segurados: 6 });
    for (let i = 0; i < 60; i++) {
      inserirComando(db, { tipo: "comando", alvo: `rm -rf /x${i}`, regra: "regra", criadoEm: "2026-10-06T16:00:00.000Z" });
    }
    expect(lerPlacar(db).segurados).toBe(66);
    expect(lerFeed(db).comandos).toHaveLength(50);
  });
});
```

- [ ] **Step 3: Rodar os testes e ver que falham.** Run: `corepack pnpm test tests/db.test.ts`. Esperado: FAIL com "Failed to resolve import @/lib/db".

- [ ] **Step 4: Implementar `src/lib/db.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { calcularNota, semaforoDaNota, semaforoDoComando } from "./avaliacao";
import { exemplosComandos, exemplosPrompts } from "./exemplos";
import type {
  Comando,
  Feed,
  NovoComando,
  NovoPrompt,
  Placar,
  Prompt,
  Semaforo,
  SemaforoSaida,
  Tamanho,
  TipoAlvo,
} from "./tipos";

export type Banco = Database.Database;

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS prompts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  texto        TEXT    NOT NULL,
  criado_em    TEXT    NOT NULL,
  tamanho      TEXT    NOT NULL CHECK (tamanho IN ('ajuste', 'funcionalidade', 'sistema')),
  tamanho_pct  INTEGER NOT NULL CHECK (tamanho_pct  BETWEEN 0 AND 100),
  objetivo_pct INTEGER NOT NULL CHECK (objetivo_pct BETWEEN 0 AND 100),
  onde_pct     INTEGER NOT NULL CHECK (onde_pct     BETWEEN 0 AND 100),
  pronto_pct   INTEGER NOT NULL CHECK (pronto_pct   BETWEEN 0 AND 100),
  foco_pct     INTEGER NOT NULL CHECK (foco_pct     BETWEEN 0 AND 100),
  nota         INTEGER NOT NULL CHECK (nota         BETWEEN 0 AND 100),
  semaforo     TEXT    NOT NULL CHECK (semaforo IN ('verde', 'amarelo', 'vermelho'))
);
CREATE TABLE IF NOT EXISTS comandos (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  criado_em TEXT NOT NULL,
  tipo      TEXT NOT NULL CHECK (tipo IN ('comando', 'arquivo')),
  alvo      TEXT NOT NULL,
  regra     TEXT,
  semaforo  TEXT NOT NULL CHECK (semaforo IN ('liberado', 'segurado'))
);
CREATE INDEX IF NOT EXISTS prompts_recentes  ON prompts  (criado_em DESC, id DESC);
CREATE INDEX IF NOT EXISTS comandos_recentes ON comandos (criado_em DESC, id DESC);
`;

interface LinhaPrompt {
  id: number;
  texto: string;
  criado_em: string;
  tamanho: Tamanho;
  tamanho_pct: number;
  objetivo_pct: number;
  onde_pct: number;
  pronto_pct: number;
  foco_pct: number;
  nota: number;
  semaforo: Semaforo;
}

interface LinhaComando {
  id: number;
  criado_em: string;
  tipo: TipoAlvo;
  alvo: string;
  regra: string | null;
  semaforo: SemaforoSaida;
}

const paraPrompt = (l: LinhaPrompt): Prompt => ({
  id: l.id,
  texto: l.texto,
  criadoEm: l.criado_em,
  criterios: {
    tamanho: l.tamanho,
    tamanhoPct: l.tamanho_pct,
    objetivoPct: l.objetivo_pct,
    ondePct: l.onde_pct,
    prontoPct: l.pronto_pct,
    focoPct: l.foco_pct,
  },
  nota: l.nota,
  semaforo: l.semaforo,
});

const paraComando = (l: LinhaComando): Comando => ({
  id: l.id,
  criadoEm: l.criado_em,
  tipo: l.tipo,
  alvo: l.alvo,
  regra: l.regra,
  semaforo: l.semaforo,
});

export function inserirPrompt(db: Banco, p: NovoPrompt): Prompt {
  const semaforo = semaforoDaNota(p.nota);
  const r = db
    .prepare(
      `INSERT INTO prompts (texto, criado_em, tamanho, tamanho_pct, objetivo_pct, onde_pct, pronto_pct, foco_pct, nota, semaforo)
       VALUES (@texto, @criadoEm, @tamanho, @tamanhoPct, @objetivoPct, @ondePct, @prontoPct, @focoPct, @nota, @semaforo)`,
    )
    .run({ texto: p.texto, criadoEm: p.criadoEm, ...p.criterios, nota: p.nota, semaforo });
  return { ...p, id: Number(r.lastInsertRowid), semaforo };
}

export function inserirComando(db: Banco, c: NovoComando): Comando {
  const semaforo = semaforoDoComando(c.regra);
  const r = db
    .prepare(
      `INSERT INTO comandos (criado_em, tipo, alvo, regra, semaforo)
       VALUES (@criadoEm, @tipo, @alvo, @regra, @semaforo)`,
    )
    .run({ criadoEm: c.criadoEm, tipo: c.tipo, alvo: c.alvo, regra: c.regra, semaforo });
  return { ...c, id: Number(r.lastInsertRowid), semaforo };
}

export function lerPlacar(db: Banco): Placar {
  const linhas = db.prepare("SELECT semaforo, COUNT(*) AS n FROM prompts GROUP BY semaforo").all() as {
    semaforo: Semaforo;
    n: number;
  }[];
  const conta = (s: Semaforo) => linhas.find((l) => l.semaforo === s)?.n ?? 0;
  const { n: segurados } = db.prepare("SELECT COUNT(*) AS n FROM comandos WHERE semaforo = 'segurado'").get() as {
    n: number;
  };
  return { passaram: conta("verde"), perguntas: conta("amarelo"), barrados: conta("vermelho"), segurados };
}

export function lerFeed(db: Banco, limite = 50): Feed {
  const prompts = db
    .prepare("SELECT * FROM prompts ORDER BY criado_em DESC, id DESC LIMIT ?")
    .all(limite) as LinhaPrompt[];
  const comandos = db
    .prepare("SELECT * FROM comandos ORDER BY criado_em DESC, id DESC LIMIT ?")
    .all(limite) as LinhaComando[];
  return { prompts: prompts.map(paraPrompt), comandos: comandos.map(paraComando), placar: lerPlacar(db) };
}

function semearSeVazio(db: Banco, agora: number) {
  const { n } = db.prepare("SELECT (SELECT COUNT(*) FROM prompts) + (SELECT COUNT(*) FROM comandos) AS n").get() as {
    n: number;
  };
  if (n > 0) return;
  const quando = (minutos: number) => new Date(agora - minutos * 60_000).toISOString();
  db.transaction(() => {
    for (const e of exemplosPrompts) {
      inserirPrompt(db, { texto: e.texto, criterios: e.criterios, nota: calcularNota(e.criterios), criadoEm: quando(e.minutosAtras) });
    }
    for (const e of exemplosComandos) {
      inserirComando(db, { tipo: e.tipo, alvo: e.alvo, regra: e.regra, criadoEm: quando(e.minutosAtras) });
    }
  })();
}

/** Abre (ou cria) o banco, garante as tabelas e grava os exemplos se estiver vazio. */
export function abrirBanco(caminho: string, agora = Date.now()): Banco {
  const db = new Database(caminho);
  db.pragma("journal_mode = WAL");
  db.exec(ESQUEMA);
  semearSeVazio(db, agora);
  return db;
}

// Uma conexão só por processo; o globalThis sobrevive ao recarregamento do `next dev`.
const global = globalThis as typeof globalThis & { __crivoBanco?: Banco };

export function banco(): Banco {
  if (!global.__crivoBanco) {
    const caminho = process.env.CRIVO_DB ?? path.join(process.cwd(), "data", "crivo.db");
    if (caminho !== ":memory:") fs.mkdirSync(path.dirname(caminho), { recursive: true });
    global.__crivoBanco = abrirBanco(caminho);
  }
  return global.__crivoBanco;
}
```

- [ ] **Step 5: Rodar os testes e ver que passam.** Run: `corepack pnpm test`. Esperado: todos PASS.

Se o placar não bater `{ passaram: 5, perguntas: 3, barrados: 3, segurados: 6 }`, um exemplo caiu na cor errada. Corrija os critérios em `exemplos.ts`, não o teste.

- [ ] **Step 6: Commit**

```bash
cd /home/junior/Projects/crivo && git add src/lib tests && git commit -m "Banco SQLite do Crivo com os exemplos dos dois portões

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Simulador e rotas de API

**Files:**
- Create: `src/lib/simulador.ts`, `src/app/api/feed/route.ts`, `src/app/api/simular/route.ts`
- Test: `tests/simulador.test.ts`, `tests/api.test.ts`

**Interfaces:**
- Consumes: `inserirPrompt`, `inserirComando`, `banco`, `lerFeed` (Task 3); `calcularNota`, `limitarPct`, `semaforoDaNota` (Task 2); `REGRAS` (Task 3)
- Produces:
  - `type ItemSorteado = { tipo: "prompt"; dados: NovoPrompt } | { tipo: "comando"; dados: NovoComando }`
  - `sortearItem(rand?: () => number, agora?: Date): ItemSorteado`
  - `gravarItem(db: Banco, item: ItemSorteado): void`
  - `GET /api/feed` → `Feed` (500 → `{ erro: string }`)
  - `POST /api/simular` → `Feed` (500 → `{ erro: string }`)

- [ ] **Step 1: Escrever os testes que devem falhar.** Arquivo `tests/simulador.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { semaforoDaNota } from "@/lib/avaliacao";
import { abrirBanco, lerFeed } from "@/lib/db";
import { gravarItem, sortearItem } from "@/lib/simulador";

// gerador previsível para o teste não depender da sorte
function sementeira(semente: number) {
  let s = semente;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe("sortearItem", () => {
  it("sempre gera itens válidos", () => {
    const rand = sementeira(42);
    const tipos = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const item = sortearItem(rand, new Date("2026-10-06T16:00:00Z"));
      tipos.add(item.tipo);
      expect(item.dados.criadoEm).toBe("2026-10-06T16:00:00.000Z");
      if (item.tipo === "prompt") {
        const { criterios, nota } = item.dados;
        for (const v of [criterios.tamanhoPct, criterios.objetivoPct, criterios.ondePct, criterios.prontoPct, criterios.focoPct, nota]) {
          expect(Number.isInteger(v) && v >= 0 && v <= 100).toBe(true);
        }
        expect(item.dados.texto.length).toBeGreaterThan(0);
      } else {
        expect(item.dados.alvo.length).toBeGreaterThan(0);
        expect(["comando", "arquivo"]).toContain(item.dados.tipo);
      }
    }
    expect(tipos).toEqual(new Set(["prompt", "comando"]));
  });

  it("produz as três cores de prompt ao longo de muitos sorteios", () => {
    const rand = sementeira(7);
    const cores = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const item = sortearItem(rand);
      if (item.tipo === "prompt") cores.add(semaforoDaNota(item.dados.nota));
    }
    expect(cores).toEqual(new Set(["verde", "amarelo", "vermelho"]));
  });
});

describe("gravarItem", () => {
  it("o item sorteado entra no topo do feed", () => {
    const db = abrirBanco(":memory:", Date.parse("2026-10-06T15:00:00Z"));
    const item = sortearItem(sementeira(1), new Date("2026-10-06T16:00:00Z"));
    gravarItem(db, item);
    const feed = lerFeed(db);
    const topo = item.tipo === "prompt" ? feed.prompts[0].texto : feed.comandos[0].alvo;
    expect(topo).toBe(item.tipo === "prompt" ? item.dados.texto : item.dados.alvo);
  });
});
```

Arquivo `tests/api.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Feed } from "@/lib/tipos";

process.env.CRIVO_DB = ":memory:";
const { GET } = await import("@/app/api/feed/route");
const { POST } = await import("@/app/api/simular/route");

describe("API", () => {
  it("GET /api/feed devolve os dois feeds e o placar", async () => {
    const r = await GET();
    expect(r.status).toBe(200);
    const feed = (await r.json()) as Feed;
    expect(feed.prompts.length).toBeGreaterThanOrEqual(10);
    expect(feed.comandos.length).toBeGreaterThanOrEqual(10);
    expect(feed.placar).toHaveProperty("segurados");
  });

  it("POST /api/simular acrescenta exatamente um item", async () => {
    const antes = (await (await GET()).json()) as Feed;
    const r = await POST();
    expect(r.status).toBe(200);
    const depois = (await r.json()) as Feed;
    const total = (f: Feed) => f.prompts.length + f.comandos.length;
    expect(total(depois)).toBe(total(antes) + 1);
  });
});
```

- [ ] **Step 2: Rodar os testes e ver que falham.** Run: `corepack pnpm test`. Esperado: FAIL com "Failed to resolve import" de `@/lib/simulador` e `@/app/api/feed/route`.

- [ ] **Step 3: Implementar `src/lib/simulador.ts`**

```ts
import { calcularNota, limitarPct } from "./avaliacao";
import { inserirComando, inserirPrompt, type Banco } from "./db";
import { REGRAS } from "./exemplos";
import type { Criterios, NovoComando, NovoPrompt, TipoAlvo } from "./tipos";

export type ItemSorteado = { tipo: "prompt"; dados: NovoPrompt } | { tipo: "comando"; dados: NovoComando };

const MODELOS_PROMPT: { texto: string; criterios: Criterios }[] = [
  { texto: "arruma isso", criterios: { tamanho: "ajuste", tamanhoPct: 20, objetivoPct: 5, ondePct: 0, prontoPct: 0, focoPct: 60 } },
  { texto: "faz o app ficar igual ao do concorrente", criterios: { tamanho: "sistema", tamanhoPct: 95, objetivoPct: 20, ondePct: 5, prontoPct: 5, focoPct: 30 } },
  {
    texto: "deixa o dashboard mais bonito e adiciona gráfico de vendas e exportação em PDF e muda o login",
    criterios: { tamanho: "sistema", tamanhoPct: 75, objetivoPct: 45, ondePct: 25, prontoPct: 10, focoPct: 10 },
  },
  {
    texto: "adiciona um campo CPF no cadastro de clientes com validação",
    criterios: { tamanho: "funcionalidade", tamanhoPct: 35, objetivoPct: 80, ondePct: 45, prontoPct: 35, focoPct: 95 },
  },
  {
    texto: "o filtro de data em src/app/pedidos/Filtros.tsx ignora o fuso; usa America/Sao_Paulo. Pronto quando o pedido das 23h30 aparecer no dia certo.",
    criterios: { tamanho: "ajuste", tamanhoPct: 15, objetivoPct: 95, ondePct: 100, prontoPct: 95, focoPct: 100 },
  },
  {
    texto: "cria um endpoint GET /api/clientes/:id/pedidos em src/app/api/clientes que devolve os 20 últimos pedidos do cliente, com teste de integração cobrindo cliente sem pedidos e cliente inexistente (404)",
    criterios: { tamanho: "funcionalidade", tamanhoPct: 40, objetivoPct: 90, ondePct: 95, prontoPct: 85, focoPct: 95 },
  },
  {
    texto: "ajusta o import em src/features/financeiro/relatorios/exportacao/geradores/planilha/ConfiguracaoDeColunasDoRelatorioMensalConsolidadoPorCentroDeCusto.tsx que quebrou depois da atualização do pacote",
    criterios: { tamanho: "ajuste", tamanhoPct: 10, objetivoPct: 75, ondePct: 100, prontoPct: 35, focoPct: 100 },
  },
  {
    texto: "migra o projeto todo para microserviços",
    criterios: { tamanho: "sistema", tamanhoPct: 100, objetivoPct: 35, ondePct: 15, prontoPct: 5, focoPct: 70 },
  },
];

const MODELOS_COMANDO: { tipo: TipoAlvo; alvo: string; regra: string | null }[] = [
  { tipo: "comando", alvo: "pnpm typecheck", regra: null },
  { tipo: "comando", alvo: "git diff --stat", regra: null },
  { tipo: "arquivo", alvo: "src/app/pedidos/Filtros.tsx", regra: null },
  { tipo: "arquivo", alvo: "tests/pedidos.test.ts", regra: null },
  { tipo: "comando", alvo: "rm -rf ~/Projects/app/.git", regra: REGRAS.rmRf },
  { tipo: "comando", alvo: "git push -f origin developer", regra: REGRAS.pushForce },
  { tipo: "arquivo", alvo: ".env.production", regra: REGRAS.env },
  { tipo: "comando", alvo: 'sqlite3 data/app.db "TRUNCATE pedidos"', regra: REGRAS.drop },
  { tipo: "comando", alvo: "pnpm add lodash axios dayjs", regra: REGRAS.pacote },
  { tipo: "comando", alvo: 'git commit --no-verify -m "wip"', regra: REGRAS.semTeste },
];

function escolher<T>(lista: readonly T[], rand: () => number): T {
  return lista[Math.min(lista.length - 1, Math.floor(rand() * lista.length))];
}

/** Mexe até 10 pontos para cima ou para baixo, para os itens não serem idênticos. */
const variar = (pct: number, rand: () => number) => limitarPct(pct + (rand() - 0.5) * 20);

export function sortearItem(rand: () => number = Math.random, agora: Date = new Date()): ItemSorteado {
  const criadoEm = agora.toISOString();
  if (rand() < 0.5) {
    const m = escolher(MODELOS_PROMPT, rand);
    const criterios: Criterios = {
      ...m.criterios,
      objetivoPct: variar(m.criterios.objetivoPct, rand),
      ondePct: variar(m.criterios.ondePct, rand),
      prontoPct: variar(m.criterios.prontoPct, rand),
      focoPct: variar(m.criterios.focoPct, rand),
    };
    return { tipo: "prompt", dados: { texto: m.texto, criadoEm, criterios, nota: calcularNota(criterios) } };
  }
  const m = escolher(MODELOS_COMANDO, rand);
  return { tipo: "comando", dados: { ...m, criadoEm } };
}

export function gravarItem(db: Banco, item: ItemSorteado): void {
  if (item.tipo === "prompt") inserirPrompt(db, item.dados);
  else inserirComando(db, item.dados);
}
```

- [ ] **Step 4: Implementar as rotas.** Arquivo `src/app/api/feed/route.ts`:

```ts
import { banco, lerFeed } from "@/lib/db";

export function GET() {
  try {
    return Response.json(lerFeed(banco()));
  } catch (erro) {
    console.error("[crivo] falha ao ler o feed", erro);
    return Response.json({ erro: "Não foi possível ler o feed." }, { status: 500 });
  }
}
```

Arquivo `src/app/api/simular/route.ts`:

```ts
import { banco, lerFeed } from "@/lib/db";
import { gravarItem, sortearItem } from "@/lib/simulador";

export function POST() {
  try {
    const db = banco();
    gravarItem(db, sortearItem());
    return Response.json(lerFeed(db));
  } catch (erro) {
    console.error("[crivo] falha ao simular", erro);
    return Response.json({ erro: "Não foi possível simular." }, { status: 500 });
  }
}
```

No Next 16, um `GET` sem cache explícito é dinâmico. Se o `next build` da Task 8 marcar `/api/feed` como estático (`○`), acrescente `export const dynamic = "force-dynamic";` ao arquivo. Se esse export for recusado porque o projeto tem `cacheComponents`, use `await connection()` de `next/server` no começo do handler, tornando-o `async`.

- [ ] **Step 5: Rodar os testes e ver que passam.** Run: `corepack pnpm test`. Esperado: todos PASS.

- [ ] **Step 6: Commit**

```bash
cd /home/junior/Projects/crivo && git add src tests && git commit -m "Simulador de itens falsos e rotas /api/feed e /api/simular

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Tema de sala de controle, ícones SVG e semáforos

> Antes desta task, invoque a skill `frontend-design:frontend-design` (obrigatória pelo CLAUDE.md do usuário). O código abaixo é o ponto de partida aprovado no desenho. A skill pode refinar detalhes visuais, mas sem contrariar as Global Constraints.

**Files:**
- Modify: `src/app/layout.tsx`, `src/app/globals.css`
- Create: `src/app/icon.svg`, `src/components/icones.tsx`, `src/components/Semaforo.tsx`

**Interfaces:**
- Consumes: `Semaforo`, `SemaforoSaida` (Task 2)
- Produces:
  - Tokens Tailwind de cor: `fundo`, `painel`, `painel-2`, `borda`, `texto`, `apagado`, `verde`, `ambar`, `vermelho`, `info`
  - Tokens de fonte: `font-mono`, `font-rotulo`
  - Animações: `animate-entrada`, `animate-pulso`
  - Ícones: `Logo`, `IconeEntrada`, `IconeSaida`, `IconeTerminal`, `IconeArquivo`, `IconeChave`, `IconeSimular`, `IconeChevron`, `MarcaOk`, `MarcaPergunta`, `MarcaX`, todos com props `{ className?: string }`
  - `SemaforoEntrada({ semaforo }: { semaforo: Semaforo })`
  - `SemaforoSaida({ semaforo }: { semaforo: SemaforoSaida })`
  - `COR_ENTRADA: Record<Semaforo, string>`
  - `COR_SAIDA: Record<SemaforoSaida, string>`
  - `ROTULO_ENTRADA: Record<Semaforo, string>`

- [ ] **Step 1: `src/app/globals.css`** (substitui o arquivo inteiro)

```css
@import "tailwindcss";

@theme {
  --color-fundo: #04070c;
  --color-painel: #0a1018;
  --color-painel-2: #0f1722;
  --color-borda: #1c2734;
  --color-texto: #d5e1ec;
  --color-apagado: #6e8094;
  --color-verde: #34f08a;
  --color-ambar: #ffb627;
  --color-vermelho: #ff3d52;
  --color-info: #4cc9f0;

  --font-mono: var(--font-jetbrains), ui-monospace, monospace;
  --font-rotulo: var(--font-barlow), ui-sans-serif, sans-serif;

  --animate-entrada: entrada 1.6s ease-out;
  --animate-pulso: pulso 1.6s ease-in-out infinite;

  @keyframes entrada {
    0% {
      box-shadow: 0 0 0 1px var(--color-info), 0 0 22px -4px var(--color-info);
      background-color: color-mix(in oklab, var(--color-info) 10%, var(--color-painel));
    }
    100% {
      box-shadow: 0 0 0 1px transparent, 0 0 0 0 transparent;
    }
  }
  @keyframes pulso {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }
}

html {
  color-scheme: dark;
}

body {
  background-color: var(--color-fundo);
  color: var(--color-texto);
  /* grade fina de sala de controle + brilho frio no topo */
  background-image:
    radial-gradient(ellipse 80% 40% at 50% -10%, color-mix(in oklab, var(--color-info) 9%, transparent), transparent 70%),
    linear-gradient(to right, color-mix(in oklab, var(--color-borda) 35%, transparent) 1px, transparent 1px),
    linear-gradient(to bottom, color-mix(in oklab, var(--color-borda) 35%, transparent) 1px, transparent 1px);
  background-size: auto, 32px 32px, 32px 32px;
}

::selection {
  background: color-mix(in oklab, var(--color-info) 35%, transparent);
}

@media (prefers-reduced-motion: reduce) {
  *, ::before, ::after {
    animation: none !important;
    transition: none !important;
  }
}
```

- [ ] **Step 2: `src/app/layout.tsx`** (substitui o arquivo inteiro)

```tsx
import type { Metadata } from "next";
import { Barlow_Condensed, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });
const rotulo = Barlow_Condensed({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-barlow" });

export const metadata: Metadata = {
  title: "Crivo",
  description: "Os dois portões do Claude Code",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${mono.variable} ${rotulo.variable}`}>
      <body className="min-h-dvh font-rotulo antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: `src/components/icones.tsx`**

```tsx
type P = { className?: string };

const traco = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** Peneira vista de cima: aro, grade de furos e um traço que atravessa. */
export function Logo({ className }: P) {
  const furos = [10, 16, 22].flatMap((y) => [10, 16, 22].map((x) => ({ x, y })));
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <circle cx="16" cy="16" r="13.5" {...traco} strokeWidth={2.25} />
      <circle cx="16" cy="16" r="10" {...traco} strokeWidth={1} opacity={0.35} />
      {furos.map(({ x, y }) => (
        <circle
          key={`${x}-${y}`}
          cx={x}
          cy={y}
          r={x === 16 && y === 16 ? 1.9 : 1.35}
          fill={x === 16 && y === 16 ? "var(--color-verde)" : "currentColor"}
        />
      ))}
      <path d="M4.5 25.5 27.5 6.5" stroke="var(--color-info)" strokeWidth={1.5} strokeLinecap="round" opacity={0.9} />
    </svg>
  );
}

export function IconeEntrada({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M3 12h11M10 8l4 4-4 4" {...traco} />
      <path d="M18 4v16M21 4v16" {...traco} />
    </svg>
  );
}

export function IconeSaida({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M3 4v16M6 4v16" {...traco} />
      <path d="M10 12h11M17 8l4 4-4 4" {...traco} />
    </svg>
  );
}

export function IconeTerminal({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="15" rx="2" {...traco} />
      <path d="M7 10l3 2.5L7 15M12.5 15.5H17" {...traco} />
    </svg>
  );
}

export function IconeArquivo({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" {...traco} />
      <path d="M14 3v5h5M9 13h6M9 17h4" {...traco} />
    </svg>
  );
}

export function IconeChave({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="8" cy="15" r="4" {...traco} />
      <path d="M11 12l8.5-8.5M16 7l2.5 2.5M18.5 4.5 21 7" {...traco} />
    </svg>
  );
}

export function IconeSimular({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" {...traco} />
    </svg>
  );
}

export function IconeChevron({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M6 9l6 6 6-6" {...traco} />
    </svg>
  );
}

export function MarcaOk({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" {...traco} strokeWidth={3.25} />
    </svg>
  );
}

export function MarcaPergunta({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M9 9.2a3 3 0 1 1 4.2 2.75c-.75.35-1.2 1.05-1.2 1.85v.7" {...traco} strokeWidth={3} />
      <circle cx="12" cy="18.6" r="1.6" fill="currentColor" />
    </svg>
  );
}

export function MarcaX({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M7 7l10 10M17 7 7 17" {...traco} strokeWidth={3.25} />
    </svg>
  );
}
```

- [ ] **Step 4: `src/components/Semaforo.tsx`**

```tsx
import type { ReactNode } from "react";
import type { Semaforo, SemaforoSaida as TipoSemaforoSaida } from "@/lib/tipos";
import { MarcaOk, MarcaPergunta, MarcaX } from "./icones";

export const COR_ENTRADA: Record<Semaforo, string> = {
  verde: "var(--color-verde)",
  amarelo: "var(--color-ambar)",
  vermelho: "var(--color-vermelho)",
};

export const COR_SAIDA: Record<TipoSemaforoSaida, string> = {
  liberado: "var(--color-verde)",
  segurado: "var(--color-vermelho)",
};

export const ROTULO_ENTRADA: Record<Semaforo, string> = {
  verde: "passou",
  amarelo: "vai perguntar",
  vermelho: "barrado",
};

function Lampada({ acesa, cor, children }: { acesa: boolean; cor: string; children: ReactNode }) {
  return (
    <span
      className="grid size-6 place-items-center rounded-full border transition-[background-color,box-shadow]"
      style={
        acesa
          ? {
              background: cor,
              borderColor: cor,
              color: "var(--color-fundo)",
              boxShadow: `0 0 14px 1px ${cor}, inset 0 0 4px rgb(255 255 255 / 0.45)`,
            }
          : {
              background: `color-mix(in oklab, ${cor} 9%, transparent)`,
              borderColor: `color-mix(in oklab, ${cor} 22%, transparent)`,
            }
      }
    >
      {acesa ? children : null}
    </span>
  );
}

const caixa = "flex shrink-0 flex-col gap-1 rounded-full border border-borda bg-black/70 p-1";

export function SemaforoEntrada({ semaforo }: { semaforo: Semaforo }) {
  return (
    <span role="img" aria-label={`Semáforo: ${ROTULO_ENTRADA[semaforo]}`} className={caixa}>
      <Lampada acesa={semaforo === "vermelho"} cor={COR_ENTRADA.vermelho}>
        <MarcaX className="size-3.5" />
      </Lampada>
      <Lampada acesa={semaforo === "amarelo"} cor={COR_ENTRADA.amarelo}>
        <MarcaPergunta className="size-3.5" />
      </Lampada>
      <Lampada acesa={semaforo === "verde"} cor={COR_ENTRADA.verde}>
        <MarcaOk className="size-3.5" />
      </Lampada>
    </span>
  );
}

export function SemaforoSaida({ semaforo }: { semaforo: TipoSemaforoSaida }) {
  return (
    <span role="img" aria-label={`Semáforo: ${semaforo}`} className={caixa}>
      <Lampada acesa={semaforo === "segurado"} cor={COR_SAIDA.segurado}>
        <MarcaX className="size-3.5" />
      </Lampada>
      <Lampada acesa={semaforo === "liberado"} cor={COR_SAIDA.liberado}>
        <MarcaOk className="size-3.5" />
      </Lampada>
    </span>
  );
}
```

- [ ] **Step 5: `src/app/icon.svg`** (favicon: o mesmo logo, com as cores fixas)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="#04070c"/>
  <circle cx="16" cy="16" r="12" fill="none" stroke="#d5e1ec" stroke-width="2.25"/>
  <g fill="#d5e1ec">
    <circle cx="10.5" cy="10.5" r="1.4"/><circle cx="16" cy="10.5" r="1.4"/><circle cx="21.5" cy="10.5" r="1.4"/>
    <circle cx="10.5" cy="16" r="1.4"/><circle cx="21.5" cy="16" r="1.4"/>
    <circle cx="10.5" cy="21.5" r="1.4"/><circle cx="16" cy="21.5" r="1.4"/><circle cx="21.5" cy="21.5" r="1.4"/>
  </g>
  <circle cx="16" cy="16" r="2" fill="#34f08a"/>
  <path d="M6 25 26 7" stroke="#4cc9f0" stroke-width="1.6" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 6: Verificar tipos e lint.** Run: `corepack pnpm typecheck && corepack pnpm lint`. Esperado: sem erros. A `page.tsx` do template ainda existe e continua compilando, porque ela é trocada na Task 7.

- [ ] **Step 7: Commit**

```bash
cd /home/junior/Projects/crivo && git add src && git commit -m "Tema de sala de controle, logo e ícones em SVG e semáforos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Peças da tela (barra de critério, itens, coluna, placar, rodapé)

**Files:**
- Create: `src/components/BarraCriterio.tsx`, `src/components/ItemPrompt.tsx`, `src/components/ItemComando.tsx`, `src/components/Coluna.tsx`, `src/components/Placar.tsx`, `src/components/Rodape.tsx`

**Interfaces:**
- Consumes: tipos (Task 2), `formatarHora`, `semaforoDaNota` (Task 2), ícones e semáforos (Task 5)
- Produces:
  - `BarraCriterio({ rotulo, pct, detalhe?, escala?, alerta? })`
  - `ItemPrompt({ prompt, novo }: { prompt: Prompt; novo: boolean })`
  - `ItemComando({ comando, novo }: { comando: Comando; novo: boolean })`
  - `Coluna({ id, titulo, subtitulo, icone, total, oculta, children })`
  - `Placar({ placar }: { placar: Placar })`
  - `Rodape({ chaveCarregada, simulando, erro, onSimular })`

- [ ] **Step 1: `src/components/BarraCriterio.tsx`**

```tsx
import { semaforoDaNota } from "@/lib/avaliacao";
import { COR_ENTRADA } from "./Semaforo";

const SEGMENTOS = 20;

interface Props {
  rotulo: string;
  pct: number;
  /** Texto curto ao lado da porcentagem (ex.: a classe do tamanho). */
  detalhe?: string;
  /** Escala neutra (o tamanho): não é bom nem ruim. */
  escala?: boolean;
  /** Na escala, pinta de alerta (ex.: sistema inteiro). */
  alerta?: boolean;
}

export function BarraCriterio({ rotulo, pct, detalhe, escala = false, alerta = false }: Props) {
  const acesos = Math.round((pct / 100) * SEGMENTOS);
  const cor = escala ? (alerta ? "var(--color-vermelho)" : "var(--color-info)") : COR_ENTRADA[semaforoDaNota(pct)];
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 sm:grid-cols-[10.5rem_1fr_auto]">
      <span className="text-sm uppercase tracking-[0.12em] text-apagado">{rotulo}</span>
      <div
        role="meter"
        aria-label={rotulo}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={detalhe ? `${detalhe}, ${pct}%` : `${pct}%`}
        className="order-last col-span-2 flex h-3 gap-[3px] sm:order-none sm:col-span-1"
      >
        {Array.from({ length: SEGMENTOS }, (_, i) => (
          <span
            key={i}
            className="flex-1 rounded-[1px]"
            style={
              i < acesos
                ? { background: cor, boxShadow: `0 0 6px -1px ${cor}` }
                : { background: "var(--color-borda)" }
            }
          />
        ))}
      </div>
      <span className="text-right font-mono text-xs tabular-nums">
        {detalhe ? (
          <span className="mr-2 uppercase" style={{ color: alerta ? "var(--color-vermelho)" : "var(--color-apagado)" }}>
            {detalhe}
          </span>
        ) : null}
        <span style={{ color: cor }}>{pct}%</span>
      </span>
    </div>
  );
}
```

- [ ] **Step 2: `src/components/ItemPrompt.tsx`**

```tsx
"use client";

import { useId, useState } from "react";
import { formatarHora } from "@/lib/hora";
import type { Prompt, Tamanho } from "@/lib/tipos";
import { BarraCriterio } from "./BarraCriterio";
import { IconeChevron } from "./icones";
import { COR_ENTRADA, ROTULO_ENTRADA, SemaforoEntrada } from "./Semaforo";

const ROTULO_TAMANHO: Record<Tamanho, string> = {
  ajuste: "ajuste pequeno",
  funcionalidade: "funcionalidade",
  sistema: "sistema inteiro",
};

const AVISO = {
  amarelo: "O Claude vai perguntar antes de começar.",
  vermelho: "Barrado: este prompt não chega ao Claude.",
} as const;

export function ItemPrompt({ prompt, novo }: { prompt: Prompt; novo: boolean }) {
  const [aberto, setAberto] = useState(false);
  const idDetalhe = useId();
  const cor = COR_ENTRADA[prompt.semaforo];
  const c = prompt.criterios;

  return (
    <li className={`overflow-hidden rounded-md border border-borda bg-painel ${novo ? "animate-entrada" : ""}`}>
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls={idDetalhe}
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-start gap-3 p-3 text-left transition-colors hover:bg-painel-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-info"
      >
        <SemaforoEntrada semaforo={prompt.semaforo} />
        <span className="min-w-0 flex-1">
          <span className={`block font-mono text-sm leading-relaxed [overflow-wrap:anywhere] ${aberto ? "" : "line-clamp-2"}`}>
            {prompt.texto}
          </span>
          <span className="mt-2 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-apagado">
            <time dateTime={prompt.criadoEm} className="font-mono">
              {formatarHora(prompt.criadoEm)}
            </time>
            <span aria-hidden="true">·</span>
            <span style={{ color: cor }}>{ROTULO_ENTRADA[prompt.semaforo]}</span>
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end">
          <span
            className="font-mono text-3xl font-semibold leading-none tabular-nums"
            style={{ color: cor, textShadow: `0 0 16px color-mix(in oklab, ${cor} 55%, transparent)` }}
          >
            {prompt.nota}
          </span>
          <span className="mt-1 text-[10px] uppercase tracking-[0.22em] text-apagado">nota</span>
        </span>
        <IconeChevron className={`mt-1 size-4 shrink-0 text-apagado transition-transform ${aberto ? "rotate-180" : ""}`} />
      </button>

      <div id={idDetalhe} hidden={!aberto} className="space-y-3 border-t border-borda bg-black/25 px-3 py-3">
        {prompt.semaforo !== "verde" ? (
          <p className="text-sm" style={{ color: cor }}>
            {AVISO[prompt.semaforo]}
          </p>
        ) : null}
        <BarraCriterio
          rotulo="Tamanho do pedido"
          pct={c.tamanhoPct}
          detalhe={ROTULO_TAMANHO[c.tamanho]}
          escala
          alerta={c.tamanho === "sistema"}
        />
        <BarraCriterio rotulo="Objetivo claro" pct={c.objetivoPct} />
        <BarraCriterio rotulo="Diz onde mexer" pct={c.ondePct} />
        <BarraCriterio rotulo="Diz quando está pronto" pct={c.prontoPct} />
        <BarraCriterio rotulo="Foco num assunto só" pct={c.focoPct} />
      </div>
    </li>
  );
}
```

- [ ] **Step 3: `src/components/ItemComando.tsx`**

```tsx
import { formatarHora } from "@/lib/hora";
import type { Comando } from "@/lib/tipos";
import { IconeArquivo, IconeTerminal } from "./icones";
import { COR_SAIDA, SemaforoSaida } from "./Semaforo";

export function ItemComando({ comando, novo }: { comando: Comando; novo: boolean }) {
  const segurado = comando.semaforo === "segurado";
  const cor = COR_SAIDA[comando.semaforo];
  const Icone = comando.tipo === "arquivo" ? IconeArquivo : IconeTerminal;

  return (
    <li
      className={`flex items-start gap-3 rounded-md border bg-painel p-3 ${
        segurado ? "border-vermelho/40" : "border-borda"
      } ${novo ? "animate-entrada" : ""}`}
    >
      <SemaforoSaida semaforo={comando.semaforo} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <Icone className="mt-0.5 size-4 shrink-0 text-apagado" />
          <span className="sr-only">{comando.tipo === "arquivo" ? "Arquivo:" : "Comando:"}</span>
          <code className="font-mono text-sm leading-relaxed [overflow-wrap:anywhere]">
            {comando.tipo === "comando" ? <span className="text-apagado">$ </span> : null}
            {comando.alvo}
          </code>
        </div>
        {comando.regra ? (
          <p className="mt-2 text-sm text-vermelho">
            <span className="mr-1.5 text-xs uppercase tracking-[0.14em] opacity-80">regra</span>
            {comando.regra}
          </p>
        ) : (
          <p className="mt-2 text-xs uppercase tracking-[0.14em] text-apagado">nenhuma regra tocada</p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 text-xs uppercase tracking-[0.14em]">
        <span style={{ color: cor }}>{segurado ? "segurado" : "liberado"}</span>
        <time dateTime={comando.criadoEm} className="font-mono text-apagado">
          {formatarHora(comando.criadoEm)}
        </time>
      </div>
    </li>
  );
}
```

- [ ] **Step 4: `src/components/Coluna.tsx`**

```tsx
import type { ReactNode } from "react";

interface Props {
  id: string;
  titulo: string;
  subtitulo: string;
  icone: ReactNode;
  total: number;
  /** No celular, só a coluna da aba ativa aparece. */
  oculta: boolean;
  children: ReactNode;
}

export function Coluna({ id, titulo, subtitulo, icone, total, oculta, children }: Props) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-titulo`}
      className={`${oculta ? "hidden md:flex" : "flex"} min-h-0 flex-col rounded-lg border border-borda bg-painel/70 backdrop-blur-sm`}
    >
      <header className="flex items-center gap-3 border-b border-borda px-4 py-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-md border border-borda bg-black/40 text-info">
          {icone}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={`${id}-titulo`} className="text-lg font-semibold uppercase leading-tight tracking-[0.2em]">
            {titulo}
          </h2>
          <p className="text-sm text-apagado">{subtitulo}</p>
        </div>
        <span className="font-mono text-xs text-apagado tabular-nums">{total} itens</span>
      </header>
      <ol className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">{children}</ol>
    </section>
  );
}
```

- [ ] **Step 5: `src/components/Placar.tsx`**

```tsx
import type { Placar as TipoPlacar } from "@/lib/tipos";

const MOSTRADORES = [
  { chave: "passaram", rotulo: "Prompts que passaram", cor: "var(--color-verde)" },
  { chave: "perguntas", rotulo: "Viraram pergunta", cor: "var(--color-ambar)" },
  { chave: "barrados", rotulo: "Prompts barrados", cor: "var(--color-vermelho)" },
  { chave: "segurados", rotulo: "Comandos segurados", cor: "var(--color-vermelho)" },
] as const;

export function Placar({ placar }: { placar: TipoPlacar }) {
  return (
    <section aria-label="Placar" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {MOSTRADORES.map((m) => (
        <div key={m.chave} className="rounded-lg border border-borda bg-painel/80 px-4 py-3">
          <p className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-apagado sm:text-sm">
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: m.cor, boxShadow: `0 0 8px ${m.cor}` }} />
            {m.rotulo}
          </p>
          <p
            className="mt-1 font-mono text-4xl font-semibold tabular-nums sm:text-5xl"
            style={{ color: m.cor, textShadow: `0 0 20px color-mix(in oklab, ${m.cor} 45%, transparent)` }}
          >
            {String(placar[m.chave]).padStart(3, "0")}
          </p>
        </div>
      ))}
    </section>
  );
}
```

- [ ] **Step 6: `src/components/Rodape.tsx`**

```tsx
import { IconeChave, IconeSimular } from "./icones";

interface Props {
  chaveCarregada: boolean;
  simulando: boolean;
  erro: string | null;
  onSimular: () => void;
}

export function Rodape({ chaveCarregada, simulando, erro, onSimular }: Props) {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-borda pt-3 text-xs uppercase tracking-[0.14em] text-apagado">
      <span className="flex items-center gap-2">
        <IconeChave className="size-3.5" />
        <span
          aria-hidden="true"
          className="size-1.5 rounded-full"
          style={{ background: chaveCarregada ? "var(--color-verde)" : "var(--color-apagado)" }}
        />
        TypeSafe: {chaveCarregada ? "chave carregada" : "sem chave"}
      </span>
      <span className="flex items-center gap-3">
        <span role="status" className="normal-case tracking-normal text-vermelho">
          {erro ?? ""}
        </span>
        <button
          type="button"
          onClick={onSimular}
          disabled={simulando}
          className="flex min-h-9 items-center gap-1.5 rounded border border-borda px-3 py-1.5 uppercase tracking-[0.14em] transition-colors hover:border-apagado hover:text-texto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info disabled:opacity-50"
        >
          <IconeSimular className="size-3.5" />
          {simulando ? "simulando…" : "simular"}
        </button>
      </span>
    </footer>
  );
}
```

- [ ] **Step 7: Verificar tipos e lint.** Run: `corepack pnpm typecheck && corepack pnpm lint`. Esperado: sem erros.

- [ ] **Step 8: Commit**

```bash
cd /home/junior/Projects/crivo && git add src/components && git commit -m "Peças do painel: barras de critério, itens, colunas, placar e rodapé

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Painel ao vivo e página

**Files:**
- Create: `src/components/Painel.tsx`
- Modify: `src/app/page.tsx` (substitui o template inteiro)

**Interfaces:**
- Consumes: tudo das Tasks 2 a 6; `GET /api/feed`, `POST /api/simular` (Task 4)
- Produces: a tela completa em `/`

- [ ] **Step 1: `src/components/Painel.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Feed } from "@/lib/tipos";
import { Coluna } from "./Coluna";
import { IconeEntrada, IconeSaida, Logo } from "./icones";
import { ItemComando } from "./ItemComando";
import { ItemPrompt } from "./ItemPrompt";
import { Placar } from "./Placar";
import { Rodape } from "./Rodape";

const INTERVALO_MS = 2000;
const maiorId = (xs: { id: number }[]) => xs.reduce((m, x) => Math.max(m, x.id), 0);

type Aba = "entrada" | "saida";

export function Painel({ feedInicial, chaveCarregada }: { feedInicial: Feed; chaveCarregada: boolean }) {
  const [feed, setFeed] = useState(feedInicial);
  const [sinal, setSinal] = useState<"ao-vivo" | "sem-sinal">("ao-vivo");
  const [aba, setAba] = useState<Aba>("entrada");
  const [simulando, setSimulando] = useState(false);
  const [erroSimular, setErroSimular] = useState<string | null>(null);
  // Só os itens que chegaram depois do carregamento ganham o brilho de entrada.
  const [corte] = useState(() => ({ prompt: maiorId(feedInicial.prompts), comando: maiorId(feedInicial.comandos) }));

  // Toda requisição ganha um número; resposta mais velha que a última aplicada é descartada.
  const sequencia = useRef(0);
  const aplicada = useRef(0);

  const aplicar = useCallback((n: number, novo: Feed) => {
    if (n < aplicada.current) return;
    aplicada.current = n;
    setFeed(novo);
  }, []);

  const consultar = useCallback(async () => {
    const n = ++sequencia.current;
    try {
      const r = await fetch("/api/feed", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      aplicar(n, (await r.json()) as Feed);
      setSinal("ao-vivo");
    } catch {
      setSinal("sem-sinal");
    }
  }, [aplicar]);

  useEffect(() => {
    let timer: number | undefined;
    const iniciar = () => {
      if (timer === undefined) timer = window.setInterval(consultar, INTERVALO_MS);
    };
    const parar = () => {
      window.clearInterval(timer);
      timer = undefined;
    };
    const aoMudarVisibilidade = () => {
      if (document.visibilityState === "visible") {
        void consultar();
        iniciar();
      } else {
        parar();
      }
    };
    if (document.visibilityState === "visible") iniciar();
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    return () => {
      parar();
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    };
  }, [consultar]);

  async function simular() {
    setSimulando(true);
    setErroSimular(null);
    const n = ++sequencia.current;
    try {
      const r = await fetch("/api/simular", { method: "POST" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      aplicar(n, (await r.json()) as Feed);
    } catch {
      setErroSimular("Não deu para simular agora. Tente de novo.");
    } finally {
      setSimulando(false);
    }
  }

  const corSinal = sinal === "ao-vivo" ? "var(--color-verde)" : "var(--color-ambar)";

  return (
    <div className="mx-auto flex min-h-dvh max-w-[1600px] flex-col gap-4 p-4 md:h-dvh md:p-6">
      <header className="flex items-center gap-3">
        <Logo className="size-10 shrink-0 text-texto" />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold uppercase leading-none tracking-[0.34em]">Crivo</h1>
          <p className="mt-1 text-xs uppercase tracking-[0.2em] text-apagado sm:text-sm">Os dois portões do Claude Code</p>
        </div>
        <p role="status" className="ml-auto flex items-center gap-2 font-mono text-xs uppercase tracking-[0.14em]">
          <span
            aria-hidden="true"
            className={`size-2 rounded-full ${sinal === "ao-vivo" ? "animate-pulso" : ""}`}
            style={{ background: corSinal, boxShadow: `0 0 10px ${corSinal}` }}
          />
          <span style={{ color: corSinal }}>{sinal === "ao-vivo" ? "ao vivo" : "sem sinal"}</span>
        </p>
      </header>

      <Placar placar={feed.placar} />

      <div role="tablist" aria-label="Portões" className="grid grid-cols-2 gap-2 md:hidden">
        {(
          [
            ["entrada", "Entrada"],
            ["saida", "Saída"],
          ] as const
        ).map(([valor, rotulo]) => (
          <button
            key={valor}
            type="button"
            role="tab"
            aria-selected={aba === valor}
            aria-controls={`portao-${valor}`}
            onClick={() => setAba(valor)}
            className={`min-h-11 rounded-md border text-sm font-semibold uppercase tracking-[0.18em] ${
              aba === valor ? "border-info bg-info/10 text-texto" : "border-borda text-apagado"
            }`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      <main className="grid min-h-0 flex-1 gap-4 md:grid-cols-2">
        <Coluna
          id="portao-entrada"
          titulo="Portão de entrada"
          subtitulo="Cada prompt, antes de o Claude ler"
          icone={<IconeEntrada className="size-5" />}
          total={feed.prompts.length}
          oculta={aba !== "entrada"}
        >
          {feed.prompts.map((p) => (
            <ItemPrompt key={p.id} prompt={p} novo={p.id > corte.prompt} />
          ))}
        </Coluna>
        <Coluna
          id="portao-saida"
          titulo="Portão de saída"
          subtitulo="Cada comando, contra as regras da casa"
          icone={<IconeSaida className="size-5" />}
          total={feed.comandos.length}
          oculta={aba !== "saida"}
        >
          {feed.comandos.map((c) => (
            <ItemComando key={c.id} comando={c} novo={c.id > corte.comando} />
          ))}
        </Coluna>
      </main>

      <Rodape chaveCarregada={chaveCarregada} simulando={simulando} erro={erroSimular} onSimular={simular} />
    </div>
  );
}
```

- [ ] **Step 2: `src/app/page.tsx`** (substitui o template inteiro)

```tsx
import { connection } from "next/server";
import { Painel } from "@/components/Painel";
import { chaveCarregada } from "@/lib/ambiente";
import { banco, lerFeed } from "@/lib/db";

export default async function Pagina() {
  // Lê o banco a cada pedido: nada de página congelada no build.
  await connection();
  return <Painel feedInicial={lerFeed(banco())} chaveCarregada={chaveCarregada(process.env.TYPESAFE_API_KEY)} />;
}
```

- [ ] **Step 3: Verificar tipos, lint e testes.** Run: `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test`. Esperado: sem erros e todos os testes passando.

- [ ] **Step 4: Ver a tela de verdade.**
  - Confirme que a porta está livre: `ss -ltnp | grep ':4000 '`. Se estiver ocupada, pare e avise o usuário.
  - Rode `corepack pnpm dev` em segundo plano e abra `http://localhost:4000` com as ferramentas de navegador (Playwright MCP).
  - Confira:
    - o placar `005 / 003 / 003 / 006`
    - as duas colunas com 11 itens cada, o mais novo em cima
    - o console sem erro de hidratação

- [ ] **Step 5: Commit**

```bash
cd /home/junior/Projects/crivo && git add src && git commit -m "Painel ao vivo: placar, dois portões, simular e abas no celular

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Verificação completa

**Files:**
- Modify: só o que a verificação revelar quebrado. Bugs passam por `superpowers:systematic-debugging` antes de qualquer correção.

- [ ] **Step 1: Verificação estática completa**

```bash
cd /home/junior/Projects/crivo && corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test && corepack pnpm build
```

Esperado: tudo verde. No resumo do build, `/`, `/api/feed` e `/api/simular` aparecem como dinâmicos (`ƒ`). Se `/api/feed` aparecer como estático, aplique a nota do Step 4 da Task 4.

- [ ] **Step 2: Produção em :4000, sem chave**

Rode `corepack pnpm start` em segundo plano. No navegador (Playwright MCP), em `http://localhost:4000`, confira:
1. O rodapé mostra "TypeSafe: sem chave".
2. Clicar no item "faz uns relatórios aí" abre as 5 barras, o aviso "Barrado" e o tamanho "sistema inteiro" em vermelho. Clicar de novo fecha. O item precisa ter `aria-expanded` alternando.
3. Clicar em "simular" 5 vezes seguidas, rápido: aparecem exatamente 5 itens novos no topo, com brilho, e o placar soma certo. Nenhum item some depois da consulta seguinte.
4. Simular até sair o prompt do caminho `ConfiguracaoDeColunas…` (ou inseri-lo via `POST` repetido): ele quebra dentro da coluna e `document.documentElement.scrollWidth <= window.innerWidth`.
5. Na aba DevTools/Network, o `/api/feed` é chamado a cada ~2 s.

Pare o servidor (só o processo que você iniciou).

- [ ] **Step 3: Com chave e sem sinal**
  - Rode `TYPESAFE_API_KEY=teste corepack pnpm start` em segundo plano.
  - Confira que o rodapé mostra "TypeSafe: chave carregada" e que o HTML da página não contém `teste`. Para isso, rode `curl -s localhost:4000 | grep -c teste`; o esperado é `0`.
  - Pare o servidor com a página aberta: o indicador vira "sem sinal" em âmbar e os itens continuam na tela.
  - Suba o servidor de novo: o indicador volta para "ao vivo".
  - Pare o servidor no fim.

- [ ] **Step 4: Celular**
  - Redimensione o navegador para 390×844.
  - Confira: aparecem as abas Entrada e Saída, só uma coluna por vez, o placar em 2×2, sem rolagem horizontal, e o rodapé e o botão simular acessíveis.
  - Tire um screenshot de cada aba para mostrar ao usuário.

- [ ] **Step 5: Commit das correções (se houver)**

```bash
cd /home/junior/Projects/crivo && git status --short && git add -A && git commit -m "Ajustes da verificação do painel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Entregar.** Deixe tudo na `developer`, sem mesclar na `main`, e reporte ao usuário:
  - o que foi verificado, com as evidências (saída dos testes e screenshots)
  - como rodar: `cd ~/Projects/crivo && corepack pnpm dev` → `http://localhost:4000`
