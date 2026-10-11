# Crivo etapa 2 — Ganchos do Claude Code no happy-team-chat — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o Crivo passa a receber de verdade os prompts e as ações (comandos e arquivos) do Claude Code no happy-team-chat, registra tudo, deixa passar e mostra ao vivo. Os dados de mentira e o botão "Simular" saem.

**Architecture:**
- Ganchos `command` com `curl` silencioso no `.claude/settings.local.json` do happy-team-chat fazem POST do pacote do hook para duas rotas novas do Crivo.
- Funções puras em `src/lib/ganchos.ts` traduzem o pacote, `db.ts` (esquema versão 2) grava, e `conexao.ts` guarda na memória o sinal "conectado".
- A tela continua consultando `/api/feed`, agora a cada 1 s.

**Tech Stack:**
- Next.js 16.4 (`cacheComponents`), React 19, Tailwind 4.
- `better-sqlite3` 13, Vitest 5.
- `corepack pnpm`, `curl`.

**Spec:** `docs/superpowers/specs/2026-10-06-crivo-ganchos-design.md`

## Global Constraints

- **Crivo:** `/home/junior/Projects/crivo`, branch `developer`.
- **happy-team-chat:** `/home/junior/Projects/happy-team-chat`, branch `developer`. Ali só o `.gitignore` entra em commit. Nunca tocar no `CLAUDE.md` sem commit do usuário. Nunca mesclar na `main`, nunca push, nunca PR.
- `pnpm` só via `corepack pnpm …`.
- Porta fixa 4000, escutando só em `127.0.0.1`: `next dev -p 4000 -H 127.0.0.1` / `next start -p 4000 -H 127.0.0.1`.
- Ganchos sempre terminam com sucesso e sem saída (`curl -s -m 2 -o /dev/null … || true`, `timeout: 5`).
- **Prompt sem nota:** semáforo `verde`, nota exibida "—", conta em "passaram".
- **"Conectado":** só na memória do Crivo; acende só com prompt; mostra "último sinal às HH:MM:SS" via `formatarHora`.
- Consulta automática a cada **1000 ms**.
- Nunca exibir o conteúdo de `.env.local`, que tem uma chave real. Para conferir a chave, só testar se existe.
- **Nunca derrubar um servidor que você não iniciou.** Se a porta 4000 estiver ocupada por outro processo, pare e avise o usuário.
- Commits com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Textos da interface em português do Brasil.
- **Entre as Tasks 1 e 4, o `typecheck` pode falhar:** a UI só se adapta aos tipos novos na Task 4. O portão de cada task até lá é o Vitest; o `typecheck` volta a ser obrigatório a partir da Task 4.

## Review Focus

1. **Pacote do Claude Code com campos extras ou faltando** (por exemplo `tool_input` sem `command`, ou `tool_name` igual a `constructor`): nunca pode gravar lixo nem quebrar. Teste na Task 1.
2. **Crivo desligado ou lento:** o gancho tem que terminar com código 0, sem saída e em ≤ 2 s. Verificado de verdade na Task 6.
3. **Banco da etapa 1 já existente** em `data/crivo.db`: precisa ser recriado uma vez, e só uma. Teste na Task 2.
4. **Prompt com várias linhas, emoji ou muito longo:** precisa ser gravado igual e exibido com as quebras de linha ao abrir. Teste de ida e volta na Task 2; conferido na tela na Task 6.
5. **Painel acessível pela rede local:** não pode ser. Verificado na Task 6.

---

## Mapa de arquivos

```
Crivo
  src/lib/tipos.ts          (modifica) nota/criterios nulos, origem, sessao, Conexao, Feed.conexao
  src/lib/avaliacao.ts      (modifica) + semaforoDoPrompt
  src/lib/ganchos.ts        (cria)     lerGanchoPrompt, lerGanchoFerramenta
  src/lib/db.ts             (reescreve) esquema v2 + migração, sem semeadura
  src/lib/conexao.ts        (cria)     registrarSinal, lerConexao
  src/lib/respostas.ts      (reescreve) montarFeed, respostaFeed, respostaGanchoPrompt, respostaGanchoFerramenta
  src/lib/exemplos.ts       (apaga)
  src/lib/simulador.ts      (apaga)
  src/app/api/simular/      (apaga)
  src/app/api/ganchos/prompt/route.ts      (cria)
  src/app/api/ganchos/ferramenta/route.ts  (cria)
  src/app/page.tsx          (modifica) usa montarFeed
  src/components/Painel.tsx (modifica) sem simular, 1 s, indicador do projeto
  src/components/Coluna.tsx (modifica) mensagem de coluna vazia
  src/components/ItemPrompt.tsx (modifica) prompt sem nota
  src/components/Rodape.tsx (modifica) só o indicador TypeSafe
  src/components/icones.tsx (modifica) remove IconeSimular
  package.json              (modifica) -H 127.0.0.1
  tests/ganchos.test.ts, tests/conexao.test.ts (cria); tests/db.test.ts, tests/api.test.ts, tests/avaliacao.test.ts (reescreve/modifica); tests/simulador.test.ts (apaga)
happy-team-chat
  .claude/settings.local.json (cria, ignorado)
  .gitignore                (modifica) + .claude/settings.local.json
```

---

### Task 1: Tipos, `semaforoDoPrompt` e tradução dos ganchos

**Files:**
- Modify: `src/lib/tipos.ts`, `src/lib/avaliacao.ts`, `tests/avaliacao.test.ts`
- Create: `src/lib/ganchos.ts`, `tests/ganchos.test.ts`

**Interfaces:**
- Produces:
  - `Prompt { id; texto; criadoEm; origem: string; sessao: string | null; criterios: Criterios | null; nota: number | null; semaforo: Semaforo }`
  - `Comando { id; criadoEm; origem: string; sessao: string | null; tipo; alvo; regra; semaforo }`
  - `Conexao { conectado: boolean; ultimoSinal: string | null }`
  - `Feed { prompts; comandos; placar; conexao: Conexao }`
  - `FeedDoBanco = Omit<Feed, "conexao">`
  - `NovoPrompt = Omit<Prompt, "id" | "semaforo">`, `NovoComando = Omit<Comando, "id" | "semaforo">`
  - `semaforoDoPrompt(nota: number | null): Semaforo`
  - `lerGanchoPrompt(corpo: unknown, agora?: Date): NovoPrompt | null`
  - `lerGanchoFerramenta(corpo: unknown, agora?: Date): NovoComando | null | "ignorar"`

- [ ] **Step 1: Tipos.** Em `src/lib/tipos.ts`, substituir as interfaces `Prompt`, `Comando` e `Feed` e acrescentar `Conexao` e `FeedDoBanco`:

```ts
export interface Prompt {
  id: number;
  texto: string;
  criadoEm: string;
  /** Nome do projeto de onde veio (última pasta do cwd do Claude Code). */
  origem: string;
  sessao: string | null;
  /** Nulos enquanto não houver avaliação (IA). */
  criterios: Criterios | null;
  nota: number | null;
  semaforo: Semaforo;
}

export interface Comando {
  id: number;
  criadoEm: string;
  origem: string;
  sessao: string | null;
  tipo: TipoAlvo;
  alvo: string;
  regra: string | null;
  semaforo: SemaforoSaida;
}

export interface Conexao {
  conectado: boolean;
  ultimoSinal: string | null;
}

export interface Feed {
  prompts: Prompt[];
  comandos: Comando[];
  placar: Placar;
  conexao: Conexao;
}

export type FeedDoBanco = Omit<Feed, "conexao">;
```

(`NovoPrompt` e `NovoComando` continuam como estão.)

- [ ] **Step 2: Testes que devem falhar.** Acrescentar ao final de `tests/avaliacao.test.ts` (e incluir `semaforoDoPrompt` no import de `@/lib/avaliacao`):

```ts
describe("semaforoDoPrompt", () => {
  it("sem nota (ainda sem IA) é verde: o prompt passou", () => {
    expect(semaforoDoPrompt(null)).toBe("verde");
  });
  it("com nota segue a mesma régua da nota", () => {
    expect(semaforoDoPrompt(39)).toBe("vermelho");
    expect(semaforoDoPrompt(40)).toBe("amarelo");
    expect(semaforoDoPrompt(70)).toBe("verde");
  });
});
```

Criar `tests/ganchos.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { lerGanchoFerramenta, lerGanchoPrompt } from "@/lib/ganchos";

const agora = new Date("2026-10-07T12:00:00.000Z");
const base = { session_id: "sess-1", cwd: "/home/junior/Projects/happy-team-chat" };

describe("lerGanchoPrompt", () => {
  it("traduz o pacote do UserPromptSubmit", () => {
    const p = lerGanchoPrompt({ ...base, hook_event_name: "UserPromptSubmit", prompt: "corrige o login\nem src/auth" }, agora);
    expect(p).toEqual({
      texto: "corrige o login\nem src/auth",
      criadoEm: "2026-10-07T12:00:00.000Z",
      origem: "happy-team-chat",
      sessao: "sess-1",
      criterios: null,
      nota: null,
    });
  });

  it("aceita cwd com barra no fim e sessão ausente", () => {
    const p = lerGanchoPrompt({ cwd: "/home/junior/Projects/happy-team-chat/", prompt: "oi" }, agora);
    expect(p?.origem).toBe("happy-team-chat");
    expect(p?.sessao).toBeNull();
  });

  it.each([
    ["sem prompt", { ...base }],
    ["prompt só com espaços", { ...base, prompt: "   " }],
    ["prompt que não é texto", { ...base, prompt: 42 }],
    ["sem cwd", { session_id: "s", prompt: "oi" }],
    ["corpo nulo", null],
    ["corpo lista", [1, 2]],
    ["corpo texto", "oi"],
  ])("recusa pacote inválido: %s", (_, corpo) => {
    expect(lerGanchoPrompt(corpo, agora)).toBeNull();
  });
});

describe("lerGanchoFerramenta", () => {
  const pacote = (tool_name: string, tool_input: unknown) => ({ ...base, hook_event_name: "PreToolUse", tool_name, tool_input });

  it.each([
    ["Bash", { command: "pnpm test", description: "roda" }, "comando", "pnpm test"],
    ["Write", { file_path: "/p/src/a.ts", content: "x" }, "arquivo", "/p/src/a.ts"],
    ["Edit", { file_path: "/p/src/b.ts", old_string: "a", new_string: "b" }, "arquivo", "/p/src/b.ts"],
    ["MultiEdit", { file_path: "/p/src/c.ts", edits: [] }, "arquivo", "/p/src/c.ts"],
    ["NotebookEdit", { notebook_path: "/p/n.ipynb", new_source: "" }, "arquivo", "/p/n.ipynb"],
  ])("%s vira %s com o alvo certo", (ferramenta, entrada, tipo, alvo) => {
    expect(lerGanchoFerramenta(pacote(ferramenta, entrada), agora)).toEqual({
      tipo,
      alvo,
      regra: null,
      criadoEm: "2026-10-07T12:00:00.000Z",
      origem: "happy-team-chat",
      sessao: "sess-1",
    });
  });

  it.each(["Read", "Grep", "constructor", "toString", "__proto__"])("ferramenta fora da lista (%s) é ignorada", (nome) => {
    expect(lerGanchoFerramenta(pacote(nome, { command: "x", file_path: "y" }), agora)).toBe("ignorar");
  });

  it.each([
    ["Bash sem command", pacote("Bash", { description: "x" })],
    ["Bash com command vazio", pacote("Bash", { command: "  " })],
    ["Write sem file_path", pacote("Write", { content: "x" })],
    ["tool_input ausente", { ...base, tool_name: "Bash" }],
    ["sem tool_name", { ...base, tool_input: { command: "ls" } }],
    ["sem cwd", { tool_name: "Bash", tool_input: { command: "ls" } }],
    ["corpo nulo", null],
  ])("recusa pacote inválido: %s", (_, corpo) => {
    expect(lerGanchoFerramenta(corpo, agora)).toBeNull();
  });
});
```

- [ ] **Step 3: Rodar os testes e ver que falham.** Run: `corepack pnpm test`. Esperado: FAIL, com `semaforoDoPrompt` não exportado e `@/lib/ganchos` não encontrado.

- [ ] **Step 4: Implementar.** Acrescentar a `src/lib/avaliacao.ts`:

```ts
/** Sem nota ainda (sem IA), o prompt passou: verde. */
export function semaforoDoPrompt(nota: number | null): Semaforo {
  return nota === null ? "verde" : semaforoDaNota(nota);
}
```

Criar `src/lib/ganchos.ts`:

```ts
import path from "node:path";
import type { NovoComando, NovoPrompt, TipoAlvo } from "./tipos";

// Tradução dos pacotes que os hooks do Claude Code mandam (UserPromptSubmit e PreToolUse).

type Objeto = Record<string, unknown>;

const ehObjeto = (v: unknown): v is Objeto => typeof v === "object" && v !== null && !Array.isArray(v);
const textoCheio = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const origemDe = (cwd: string) => path.basename(cwd) || cwd;

/** Ferramentas que passam pelo portão de saída e o campo de onde sai o alvo. */
const ALVOS: Record<string, { tipo: TipoAlvo; campo: string }> = {
  Bash: { tipo: "comando", campo: "command" },
  Write: { tipo: "arquivo", campo: "file_path" },
  Edit: { tipo: "arquivo", campo: "file_path" },
  MultiEdit: { tipo: "arquivo", campo: "file_path" },
  NotebookEdit: { tipo: "arquivo", campo: "notebook_path" },
};

export function lerGanchoPrompt(corpo: unknown, agora = new Date()): NovoPrompt | null {
  if (!ehObjeto(corpo)) return null;
  const texto = textoCheio(corpo.prompt);
  const cwd = textoCheio(corpo.cwd);
  if (!texto || !cwd) return null;
  return {
    texto,
    criadoEm: agora.toISOString(),
    origem: origemDe(cwd),
    sessao: textoCheio(corpo.session_id),
    criterios: null,
    nota: null,
  };
}

/** `"ignorar"` = ferramenta fora do portão de saída; `null` = pacote inválido. */
export function lerGanchoFerramenta(corpo: unknown, agora = new Date()): NovoComando | null | "ignorar" {
  if (!ehObjeto(corpo)) return null;
  const ferramenta = textoCheio(corpo.tool_name);
  const cwd = textoCheio(corpo.cwd);
  if (!ferramenta || !cwd) return null;
  if (!Object.hasOwn(ALVOS, ferramenta)) return "ignorar";
  const { tipo, campo } = ALVOS[ferramenta];
  const alvo = ehObjeto(corpo.tool_input) ? textoCheio(corpo.tool_input[campo]) : null;
  if (!alvo) return null;
  return {
    tipo,
    alvo,
    regra: null,
    criadoEm: agora.toISOString(),
    origem: origemDe(cwd),
    sessao: textoCheio(corpo.session_id),
  };
}
```

- [ ] **Step 5: Rodar os testes de novo.** Run: `corepack pnpm test tests/ganchos.test.ts tests/avaliacao.test.ts`. Esperado: PASS. Os testes de `db`/`api`/`simulador` podem falhar agora por causa dos tipos novos; eles são refeitos nas Tasks 2 e 3.

- [ ] **Step 6: Commit**

```bash
cd /home/junior/Projects/crivo && git add src/lib tests && git commit -m "Traduz os pacotes dos hooks do Claude Code e aceita prompt sem nota

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Banco versão 2 (sem dados de mentira) e remoção do simulador

**Files:**
- Rewrite: `src/lib/db.ts`, `tests/db.test.ts`
- Delete: `src/lib/exemplos.ts`, `src/lib/simulador.ts`, `tests/simulador.test.ts`, `src/app/api/simular/route.ts`
- Modify: `src/lib/respostas.ts` (tirar `respostaSimular`, temporariamente)

**Interfaces:**
- Consumes: `semaforoDoPrompt`, `semaforoDoComando` (`avaliacao.ts`); tipos da Task 1
- Produces:
  - `VERSAO_ESQUEMA = 2`
  - `abrirBanco(caminho: string): Banco`
  - `banco(): Banco`
  - `inserirPrompt(db, p: NovoPrompt): Prompt`
  - `inserirComando(db, c: NovoComando): Comando`
  - `lerFeed(db, limite = 50): FeedDoBanco`
  - `lerPlacar(db): Placar`

- [ ] **Step 1: Testes que devem falhar.** Reescrever `tests/db.test.ts`:

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { VERSAO_ESQUEMA, abrirBanco, inserirComando, inserirPrompt, lerFeed, lerPlacar } from "@/lib/db";
import type { NovoComando, NovoPrompt } from "@/lib/tipos";

const novoPrompt = (extra: Partial<NovoPrompt> = {}): NovoPrompt => ({
  texto: "corrige o login",
  criadoEm: "2026-10-07T12:00:00.000Z",
  origem: "happy-team-chat",
  sessao: "sess-1",
  criterios: null,
  nota: null,
  ...extra,
});

const novoComando = (extra: Partial<NovoComando> = {}): NovoComando => ({
  tipo: "comando",
  alvo: "pnpm test",
  regra: null,
  criadoEm: "2026-10-07T12:00:01.000Z",
  origem: "happy-team-chat",
  sessao: "sess-1",
  ...extra,
});

const pastas: string[] = [];
const arquivoTemporario = () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "crivo-"));
  pastas.push(pasta);
  return path.join(pasta, "teste.db");
};
afterEach(() => {
  for (const p of pastas.splice(0)) fs.rmSync(p, { recursive: true, force: true });
});

describe("banco novo", () => {
  it("começa vazio: sem dados de mentira", () => {
    const feed = lerFeed(abrirBanco(":memory:"));
    expect(feed.prompts).toEqual([]);
    expect(feed.comandos).toEqual([]);
    expect(feed.placar).toEqual({ passaram: 0, perguntas: 0, barrados: 0, segurados: 0 });
  });
});

describe("prompts", () => {
  it("sem nota: grava, lê igual, fica verde e conta em 'passaram'", () => {
    const db = abrirBanco(":memory:");
    const texto = "linha 1\nlinha 2 com 'aspas', <b>html</b> e emoji 🚦";
    const p = inserirPrompt(db, novoPrompt({ texto }));
    expect(p.semaforo).toBe("verde");
    expect(lerFeed(db).prompts).toEqual([p]);
    expect(lerPlacar(db).passaram).toBe(1);
  });

  it("com nota: grava os critérios e a cor segue a nota", () => {
    const db = abrirBanco(":memory:");
    const criterios = { tamanho: "ajuste" as const, tamanhoPct: 10, objetivoPct: 50, ondePct: 50, prontoPct: 20, focoPct: 30 };
    const p = inserirPrompt(db, novoPrompt({ nota: 39, criterios }));
    expect(p.semaforo).toBe("vermelho");
    expect(lerFeed(db).prompts[0]).toEqual(p);
  });

  it("prompt enorme é gravado inteiro", () => {
    const db = abrirBanco(":memory:");
    const texto = "x".repeat(200_000);
    inserirPrompt(db, novoPrompt({ texto }));
    expect(lerFeed(db).prompts[0].texto).toHaveLength(200_000);
  });
});

describe("comandos", () => {
  it("grava origem e sessão; sem regra é liberado", () => {
    const db = abrirBanco(":memory:");
    const c = inserirComando(db, novoComando({ sessao: null }));
    expect(c.semaforo).toBe("liberado");
    expect(lerFeed(db).comandos).toEqual([c]);
  });
});

describe("lerFeed e lerPlacar", () => {
  it("mais novo primeiro, limitado, e o placar conta o banco inteiro", () => {
    const db = abrirBanco(":memory:");
    for (let i = 0; i < 60; i++) {
      inserirComando(db, novoComando({ alvo: `cmd ${i}`, regra: i % 2 ? "regra" : null, criadoEm: `2026-10-07T12:${String(i).padStart(2, "0")}:00.000Z` }));
    }
    const feed = lerFeed(db);
    expect(feed.comandos).toHaveLength(50);
    expect(feed.comandos[0].alvo).toBe("cmd 59");
    expect(feed.placar.segurados).toBe(30);
  });
});

describe("migração", () => {
  it("banco da etapa 1 (com dados de mentira) é recriado vazio no esquema novo", () => {
    const caminho = arquivoTemporario();
    const antigo = new Database(caminho);
    antigo.exec(`CREATE TABLE prompts (id INTEGER PRIMARY KEY, texto TEXT NOT NULL, criado_em TEXT NOT NULL, nota INTEGER NOT NULL, semaforo TEXT NOT NULL);
                 CREATE TABLE comandos (id INTEGER PRIMARY KEY, criado_em TEXT NOT NULL, tipo TEXT, alvo TEXT, regra TEXT, semaforo TEXT);
                 INSERT INTO prompts (texto, criado_em, nota, semaforo) VALUES ('faz uns relatórios aí', 'x', 12, 'vermelho');`);
    antigo.close();

    const db = abrirBanco(caminho);
    expect(lerFeed(db).prompts).toEqual([]);
    expect(db.pragma("user_version", { simple: true })).toBe(VERSAO_ESQUEMA);
    expect(inserirPrompt(db, novoPrompt()).origem).toBe("happy-team-chat");
    db.close();
  });

  it("banco já na versão nova não é apagado ao reabrir", () => {
    const caminho = arquivoTemporario();
    const a = abrirBanco(caminho);
    inserirPrompt(a, novoPrompt());
    inserirComando(a, novoComando());
    a.close();
    const b = abrirBanco(caminho);
    expect(lerFeed(b).prompts).toHaveLength(1);
    expect(lerFeed(b).comandos).toHaveLength(1);
    b.close();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar.** Run: `corepack pnpm test tests/db.test.ts`. Esperado: FAIL; `VERSAO_ESQUEMA` não existe e o banco novo vem com os 11 exemplos.

- [ ] **Step 3: Reescrever `src/lib/db.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { semaforoDoComando, semaforoDoPrompt } from "./avaliacao";
import type {
  Comando,
  FeedDoBanco,
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

/** v1 = etapa 1 (dados de mentira); v2 = dados reais vindos dos hooks. */
export const VERSAO_ESQUEMA = 2;

// CHECK com valor nulo passa: nota e critérios ficam vazios até a IA existir.
const ESQUEMA = `
CREATE TABLE IF NOT EXISTS prompts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  texto        TEXT    NOT NULL,
  criado_em    TEXT    NOT NULL,
  origem       TEXT    NOT NULL,
  sessao       TEXT,
  tamanho      TEXT    CHECK (tamanho IN ('ajuste', 'funcionalidade', 'sistema')),
  tamanho_pct  INTEGER CHECK (tamanho_pct  BETWEEN 0 AND 100),
  objetivo_pct INTEGER CHECK (objetivo_pct BETWEEN 0 AND 100),
  onde_pct     INTEGER CHECK (onde_pct     BETWEEN 0 AND 100),
  pronto_pct   INTEGER CHECK (pronto_pct   BETWEEN 0 AND 100),
  foco_pct     INTEGER CHECK (foco_pct     BETWEEN 0 AND 100),
  nota         INTEGER CHECK (nota         BETWEEN 0 AND 100),
  semaforo     TEXT    NOT NULL CHECK (semaforo IN ('verde', 'amarelo', 'vermelho'))
);
CREATE TABLE IF NOT EXISTS comandos (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  criado_em TEXT NOT NULL,
  origem    TEXT NOT NULL,
  sessao    TEXT,
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
  origem: string;
  sessao: string | null;
  tamanho: Tamanho | null;
  tamanho_pct: number | null;
  objetivo_pct: number | null;
  onde_pct: number | null;
  pronto_pct: number | null;
  foco_pct: number | null;
  nota: number | null;
  semaforo: Semaforo;
}

interface LinhaComando {
  id: number;
  criado_em: string;
  origem: string;
  sessao: string | null;
  tipo: TipoAlvo;
  alvo: string;
  regra: string | null;
  semaforo: SemaforoSaida;
}

const paraPrompt = (l: LinhaPrompt): Prompt => ({
  id: l.id,
  texto: l.texto,
  criadoEm: l.criado_em,
  origem: l.origem,
  sessao: l.sessao,
  criterios:
    l.tamanho === null
      ? null
      : {
          tamanho: l.tamanho,
          tamanhoPct: l.tamanho_pct ?? 0,
          objetivoPct: l.objetivo_pct ?? 0,
          ondePct: l.onde_pct ?? 0,
          prontoPct: l.pronto_pct ?? 0,
          focoPct: l.foco_pct ?? 0,
        },
  nota: l.nota,
  semaforo: l.semaforo,
});

const paraComando = (l: LinhaComando): Comando => ({
  id: l.id,
  criadoEm: l.criado_em,
  origem: l.origem,
  sessao: l.sessao,
  tipo: l.tipo,
  alvo: l.alvo,
  regra: l.regra,
  semaforo: l.semaforo,
});

export function inserirPrompt(db: Banco, p: NovoPrompt): Prompt {
  const semaforo = semaforoDoPrompt(p.nota);
  const c = p.criterios;
  const r = db
    .prepare(
      `INSERT INTO prompts (texto, criado_em, origem, sessao, tamanho, tamanho_pct, objetivo_pct, onde_pct, pronto_pct, foco_pct, nota, semaforo)
       VALUES (@texto, @criadoEm, @origem, @sessao, @tamanho, @tamanhoPct, @objetivoPct, @ondePct, @prontoPct, @focoPct, @nota, @semaforo)`,
    )
    .run({
      texto: p.texto,
      criadoEm: p.criadoEm,
      origem: p.origem,
      sessao: p.sessao,
      tamanho: c?.tamanho ?? null,
      tamanhoPct: c?.tamanhoPct ?? null,
      objetivoPct: c?.objetivoPct ?? null,
      ondePct: c?.ondePct ?? null,
      prontoPct: c?.prontoPct ?? null,
      focoPct: c?.focoPct ?? null,
      nota: p.nota,
      semaforo,
    });
  return { ...p, id: Number(r.lastInsertRowid), semaforo };
}

export function inserirComando(db: Banco, c: NovoComando): Comando {
  const semaforo = semaforoDoComando(c.regra);
  const r = db
    .prepare(
      `INSERT INTO comandos (criado_em, origem, sessao, tipo, alvo, regra, semaforo)
       VALUES (@criadoEm, @origem, @sessao, @tipo, @alvo, @regra, @semaforo)`,
    )
    .run({ criadoEm: c.criadoEm, origem: c.origem, sessao: c.sessao, tipo: c.tipo, alvo: c.alvo, regra: c.regra, semaforo });
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

export function lerFeed(db: Banco, limite = 50): FeedDoBanco {
  const prompts = db
    .prepare("SELECT * FROM prompts ORDER BY criado_em DESC, id DESC LIMIT ?")
    .all(limite) as LinhaPrompt[];
  const comandos = db
    .prepare("SELECT * FROM comandos ORDER BY criado_em DESC, id DESC LIMIT ?")
    .all(limite) as LinhaComando[];
  return { prompts: prompts.map(paraPrompt), comandos: comandos.map(paraComando), placar: lerPlacar(db) };
}

/** Banco de versão antiga só tem dados de mentira: recria as tabelas, uma vez. */
function migrar(db: Banco) {
  const versao = db.pragma("user_version", { simple: true }) as number;
  if (versao >= VERSAO_ESQUEMA) {
    db.exec(ESQUEMA);
    return;
  }
  db.transaction(() => {
    db.exec("DROP TABLE IF EXISTS prompts; DROP TABLE IF EXISTS comandos;");
    db.exec(ESQUEMA);
    db.pragma(`user_version = ${VERSAO_ESQUEMA}`);
  })();
}

/** Abre (ou cria) o banco e garante o esquema atual. */
export function abrirBanco(caminho: string): Banco {
  const db = new Database(caminho);
  db.pragma("journal_mode = WAL");
  migrar(db);
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

- [ ] **Step 4: Remover o simulador e os exemplos**

```bash
cd /home/junior/Projects/crivo && git rm -q src/lib/exemplos.ts src/lib/simulador.ts tests/simulador.test.ts src/app/api/simular/route.ts
```

Em `src/lib/respostas.ts`, apagar `respostaSimular` e o import de `./simulador`. O arquivo inteiro é reescrito na Task 3, então basta deixá-lo compilando com `respostaFeed`.

- [ ] **Step 5: Rodar os testes.** Run: `corepack pnpm test tests/db.test.ts tests/ganchos.test.ts tests/avaliacao.test.ts`. Esperado: PASS. O `tests/api.test.ts` ainda é da etapa 1 e é reescrito na Task 3.

- [ ] **Step 6: Commit**

```bash
cd /home/junior/Projects/crivo && git add -A src tests && git commit -m "Banco versão 2: sem dados de mentira, com origem e sessão, nota opcional

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Sinal "conectado", portas dos ganchos e escuta só local

**Files:**
- Create: `src/lib/conexao.ts`, `tests/conexao.test.ts`, `src/app/api/ganchos/prompt/route.ts`, `src/app/api/ganchos/ferramenta/route.ts`
- Rewrite: `src/lib/respostas.ts`, `tests/api.test.ts`
- Modify: `package.json` (scripts `dev`/`start`)

**Interfaces:**
- Consumes: `lerGanchoPrompt`, `lerGanchoFerramenta` (Task 1); `banco`, `inserirPrompt`, `inserirComando`, `lerFeed` (Task 2)
- Produces:
  - `registrarSinal(tipo: "prompt" | "ferramenta", quando: string): void`
  - `lerConexao(): Conexao`
  - `montarFeed(): Feed`
  - `respostaFeed(): Response`
  - `respostaGanchoPrompt(req: Request): Promise<Response>`
  - `respostaGanchoFerramenta(req: Request): Promise<Response>`
  - `POST /api/ganchos/prompt`, `POST /api/ganchos/ferramenta`

- [ ] **Step 1: Testes que devem falhar.** Criar `tests/conexao.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { lerConexao, registrarSinal } from "@/lib/conexao";

beforeEach(() => {
  Reflect.deleteProperty(globalThis, "__crivoConexao");
});

describe("conexão com o projeto", () => {
  it("começa desligada e sem sinal", () => {
    expect(lerConexao()).toEqual({ conectado: false, ultimoSinal: null });
  });

  it("ferramenta antes de qualquer prompt só atualiza o último sinal", () => {
    registrarSinal("ferramenta", "2026-10-07T12:00:00.000Z");
    expect(lerConexao()).toEqual({ conectado: false, ultimoSinal: "2026-10-07T12:00:00.000Z" });
  });

  it("o primeiro prompt acende e fica aceso; o último sinal acompanha tudo", () => {
    registrarSinal("prompt", "2026-10-07T12:00:00.000Z");
    registrarSinal("ferramenta", "2026-10-07T12:05:00.000Z");
    expect(lerConexao()).toEqual({ conectado: true, ultimoSinal: "2026-10-07T12:05:00.000Z" });
  });
});
```

Reescrever `tests/api.test.ts`:

```ts
import { beforeAll, describe, expect, it } from "vitest";
import type { Feed } from "@/lib/tipos";

process.env.CRIVO_DB = ":memory:";
const { respostaFeed, respostaGanchoFerramenta, respostaGanchoPrompt } = await import("@/lib/respostas");

const post = (corpo: unknown) =>
  new Request("http://127.0.0.1:4000/api/ganchos/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });
const feed = async () => (await respostaFeed().json()) as Feed;
const total = (f: Feed) => f.prompts.length + f.comandos.length;
const base = { session_id: "sess-1", cwd: "/home/junior/Projects/happy-team-chat" };

beforeAll(() => {
  Reflect.deleteProperty(globalThis, "__crivoConexao");
});

// Os testes compartilham o mesmo banco em memória e rodam em ordem.
describe("portas dos ganchos", () => {
  it("o feed começa vazio e desconectado", async () => {
    const f = await feed();
    expect(total(f)).toBe(0);
    expect(f.conexao).toEqual({ conectado: false, ultimoSinal: null });
  });

  it("ferramenta: responde {} e grava, mas não acende o 'conectado'", async () => {
    const r = await respostaGanchoFerramenta(post({ ...base, tool_name: "Bash", tool_input: { command: "pnpm test" } }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({});
    const f = await feed();
    expect(f.comandos[0]).toMatchObject({ tipo: "comando", alvo: "pnpm test", semaforo: "liberado", origem: "happy-team-chat" });
    expect(f.conexao.conectado).toBe(false);
    expect(f.conexao.ultimoSinal).not.toBeNull();
  });

  it("prompt: responde {} , grava verde sem nota e acende o 'conectado'", async () => {
    const r = await respostaGanchoPrompt(post({ ...base, hook_event_name: "UserPromptSubmit", prompt: "corrige o login" }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({});
    const f = await feed();
    expect(f.prompts[0]).toMatchObject({ texto: "corrige o login", nota: null, criterios: null, semaforo: "verde", sessao: "sess-1" });
    expect(f.placar.passaram).toBe(1);
    expect(f.conexao.conectado).toBe(true);
  });

  it("JSON quebrado e pacote incompleto: 400 sem gravar nada", async () => {
    const antes = total(await feed());
    expect((await respostaGanchoPrompt(post("{quebrado"))).status).toBe(400);
    expect((await respostaGanchoPrompt(post({ ...base }))).status).toBe(400);
    expect((await respostaGanchoFerramenta(post({ ...base, tool_name: "Bash", tool_input: {} }))).status).toBe(400);
    expect(total(await feed())).toBe(antes);
  });

  it("ferramenta fora do portão: 200 {} sem gravar", async () => {
    const antes = total(await feed());
    const r = await respostaGanchoFerramenta(post({ ...base, tool_name: "Read", tool_input: { file_path: "/x" } }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({});
    expect(total(await feed())).toBe(antes);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar.** Run: `corepack pnpm test tests/conexao.test.ts tests/api.test.ts`. Esperado: FAIL, com `@/lib/conexao` não encontrado e `respostaGanchoPrompt` não exportado.

- [ ] **Step 3: Implementar `src/lib/conexao.ts`**

```ts
import type { Conexao } from "./tipos";

// Só na memória: ao religar o Crivo, começa apagado de novo (decisão da etapa 2).
interface Estado {
  conectadoEm: string | null;
  ultimoSinal: string | null;
}

const global = globalThis as typeof globalThis & { __crivoConexao?: Estado };
const estado = (): Estado => (global.__crivoConexao ??= { conectadoEm: null, ultimoSinal: null });

/** Todo sinal atualiza o "último sinal"; só um prompt acende o "conectado". */
export function registrarSinal(tipo: "prompt" | "ferramenta", quando: string): void {
  const e = estado();
  e.ultimoSinal = quando;
  if (tipo === "prompt" && e.conectadoEm === null) e.conectadoEm = quando;
}

export function lerConexao(): Conexao {
  const e = estado();
  return { conectado: e.conectadoEm !== null, ultimoSinal: e.ultimoSinal };
}
```

- [ ] **Step 4: Reescrever `src/lib/respostas.ts`**

```ts
import { lerConexao, registrarSinal } from "./conexao";
import { banco, inserirComando, inserirPrompt, lerFeed } from "./db";
import { lerGanchoFerramenta, lerGanchoPrompt } from "./ganchos";
import type { Feed } from "./tipos";

/** O que a tela recebe: banco + estado da conexão com o projeto. */
export function montarFeed(): Feed {
  return { ...lerFeed(banco()), conexao: lerConexao() };
}

/** Corpo do GET /api/feed. */
export function respostaFeed(): Response {
  try {
    return Response.json(montarFeed());
  } catch (erro) {
    console.error("[crivo] falha ao ler o feed", erro);
    return Response.json({ erro: "Não foi possível ler o feed." }, { status: 500 });
  }
}

async function lerCorpo(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

function recusar(motivo: string): Response {
  console.warn(`[crivo] gancho recusado: ${motivo}`);
  return Response.json({ erro: motivo }, { status: 400 });
}

// Resposta {} = "pode seguir". Nesta etapa o gancho descarta a resposta de qualquer jeito.

/** Corpo do POST /api/ganchos/prompt (UserPromptSubmit). */
export async function respostaGanchoPrompt(req: Request): Promise<Response> {
  const novo = lerGanchoPrompt(await lerCorpo(req));
  if (!novo) return recusar("pacote de prompt inválido");
  try {
    inserirPrompt(banco(), novo);
    registrarSinal("prompt", novo.criadoEm);
    return Response.json({});
  } catch (erro) {
    console.error("[crivo] falha ao registrar o prompt", erro);
    return Response.json({ erro: "Não foi possível registrar o prompt." }, { status: 500 });
  }
}

/** Corpo do POST /api/ganchos/ferramenta (PreToolUse). */
export async function respostaGanchoFerramenta(req: Request): Promise<Response> {
  const novo = lerGanchoFerramenta(await lerCorpo(req));
  if (novo === "ignorar") return Response.json({});
  if (!novo) return recusar("pacote de ferramenta inválido");
  try {
    inserirComando(banco(), novo);
    registrarSinal("ferramenta", novo.criadoEm);
    return Response.json({});
  } catch (erro) {
    console.error("[crivo] falha ao registrar o comando", erro);
    return Response.json({ erro: "Não foi possível registrar o comando." }, { status: 500 });
  }
}
```

- [ ] **Step 5: Rotas.** `src/app/api/ganchos/prompt/route.ts`:

```ts
import { respostaGanchoPrompt } from "@/lib/respostas";

export function POST(request: Request) {
  return respostaGanchoPrompt(request);
}
```

`src/app/api/ganchos/ferramenta/route.ts`:

```ts
import { respostaGanchoFerramenta } from "@/lib/respostas";

export function POST(request: Request) {
  return respostaGanchoFerramenta(request);
}
```

(`src/app/api/feed/route.ts` não muda: continua `await connection(); return respostaFeed();`.)

- [ ] **Step 6: Escuta só local.** Em `package.json`:

```json
"dev": "next dev -p 4000 -H 127.0.0.1",
"start": "next start -p 4000 -H 127.0.0.1",
```

- [ ] **Step 7: Rodar os testes.** Run: `corepack pnpm test`. Esperado: tudo PASS (sanidade, avaliação, ambiente-hora, ganchos, db, conexão, api).

- [ ] **Step 8: Commit**

```bash
cd /home/junior/Projects/crivo && git add -A src tests package.json && git commit -m "Portas para os hooks do Claude Code, sinal de conectado e escuta só local

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Tela da etapa 2

**Files:**
- Modify: `src/components/Painel.tsx`, `src/components/Coluna.tsx`, `src/components/ItemPrompt.tsx`, `src/components/Rodape.tsx`, `src/components/icones.tsx`, `src/app/page.tsx`

**Interfaces:**
- Consumes: `Feed`, `Conexao` (Task 1); `montarFeed` (Task 3); `formatarHora`
- Produces:
  - `Cabecalho({ sinal, conexao? })`
  - `Coluna({ …, vazio: string })`
  - `Rodape({ chaveCarregada })`

- [ ] **Step 1: `src/app/page.tsx`.** Trocar o import de `lerFeed`/`banco` por `montarFeed`:

```tsx
import { Suspense } from "react";
import { connection } from "next/server";
import { Cabecalho, Painel } from "@/components/Painel";
import { chaveCarregada } from "@/lib/ambiente";
import { montarFeed } from "@/lib/respostas";

async function PainelComDados() {
  // O SQLite é síncrono e o Next não o enxerga: sem isto, o feed seria congelado no build.
  await connection();
  return <Painel feedInicial={montarFeed()} chaveCarregada={chaveCarregada(process.env.TYPESAFE_API_KEY)} />;
}
```

(O `export default function Pagina()` com `Suspense` continua igual.)

- [ ] **Step 2: `src/components/Rodape.tsx`** (substitui o arquivo inteiro)

```tsx
import { IconeChave } from "./icones";

export function Rodape({ chaveCarregada }: { chaveCarregada: boolean }) {
  return (
    <footer className="flex flex-wrap items-center gap-3 border-t border-borda pt-3 text-sm text-apagado">
      <span className="flex items-center gap-2">
        <IconeChave className="size-4" />
        <span
          aria-hidden="true"
          className="size-1.5 rounded-full"
          style={{ background: chaveCarregada ? "var(--color-verde)" : "var(--color-apagado)" }}
        />
        TypeSafe: {chaveCarregada ? "chave carregada" : "sem chave"}
      </span>
    </footer>
  );
}
```

Apagar `IconeSimular` de `src/components/icones.tsx`, que não tem mais uso.

- [ ] **Step 3: `src/components/Coluna.tsx`.** Acrescentar a prop `vazio: string` à interface (com o comentário `/** Mensagem quando ainda não chegou nada. */`) e trocar o `<ol>` por:

```tsx
      {total === 0 ? (
        <p className="p-6 text-sm leading-relaxed text-apagado">{vazio}</p>
      ) : (
        <ol className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">{children}</ol>
      )}
```

- [ ] **Step 4: `src/components/ItemPrompt.tsx`** (prompt sem nota)
  - Depois de `const c = prompt.criterios;`, acrescentar `const semNota = prompt.nota === null;`.
  - O texto do prompt passa a usar `${aberto ? "block whitespace-pre-wrap" : "line-clamp-2"}`.
  - O número da nota vira:

```tsx
          <span
            className="font-mono text-3xl font-semibold leading-none tabular-nums"
            style={
              semNota
                ? { color: "var(--color-apagado)" }
                : { color: cor, textShadow: `0 0 16px color-mix(in oklab, ${cor} 55%, transparent)` }
            }
          >
            {semNota ? "—" : prompt.nota}
          </span>
```

  - Dentro do detalhe, as cinco `BarraCriterio` passam a ficar dentro de `{c === null ? (…) : (<>…</>)}`, sendo o primeiro ramo:

```tsx
          <p className="text-sm text-apagado">Ainda sem avaliação: a nota chega quando a IA for ligada.</p>
```

- [ ] **Step 5: `src/components/Painel.tsx`**
  - `const INTERVALO_MS = 1000;`
  - Remover os estados `simulando` e `erroSimular`, o `simulandoAgora` e a função `simular()`.
  - `<Rodape chaveCarregada={chaveCarregada} />`
  - `<Cabecalho sinal={sinal} conexao={feed.conexao} />`
  - Acrescentar `vazio` às colunas:
    - entrada: `vazio="Esperando o primeiro prompt do happy-team-chat. Mande algo para o Claude Code lá."`
    - saída: `vazio="Nenhum comando ainda. Aparece aqui quando o Claude for rodar um comando ou mexer num arquivo."`
  - Importar `formatarHora` de `@/lib/hora` e `Conexao` de `@/lib/tipos`.
  - Acrescentar, acima de `Cabecalho`:

```tsx
const PROJETO = "happy-team-chat";

function SinalProjeto({ conexao }: { conexao: Conexao }) {
  const cor = conexao.conectado ? "var(--color-info)" : "var(--color-apagado)";
  return (
    <div className="text-right text-sm">
      <p className="flex items-center justify-end gap-2 font-medium" style={{ color: cor }}>
        <span
          aria-hidden="true"
          className="size-2 rounded-full"
          style={{ background: cor, boxShadow: conexao.conectado ? `0 0 10px ${cor}` : "none" }}
        />
        {conexao.conectado ? `${PROJETO} conectado` : `Esperando o ${PROJETO}`}
      </p>
      {conexao.ultimoSinal ? (
        <p className="text-xs text-apagado tabular-nums">último sinal às {formatarHora(conexao.ultimoSinal)}</p>
      ) : null}
    </div>
  );
}
```

  - `Cabecalho` passa a receber `{ sinal, conexao }: { sinal: …; conexao?: Conexao }`, e o bloco da direita vira uma coluna com os dois indicadores:

```tsx
      <div className="ml-auto flex flex-col items-end gap-1.5">
        <p role="status" className="flex items-center gap-2 text-sm font-medium">
          {/* (lâmpada + texto "Ao vivo / Sem sinal / Conectando…" exatamente como hoje) */}
        </p>
        {conexao ? <SinalProjeto conexao={conexao} /> : null}
      </div>
```

- [ ] **Step 6: Verificação estática.** Run: `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test`. Esperado: tudo sem erros (o `typecheck` volta a ser obrigatório aqui).

- [ ] **Step 7: Commit**

```bash
cd /home/junior/Projects/crivo && git add -A src && git commit -m "Tela da etapa 2: colunas reais, sinal do happy-team-chat e sem Simular

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Ganchos no happy-team-chat

**Files:**
- Create: `/home/junior/Projects/happy-team-chat/.claude/settings.local.json` (ignorado pelo git)
- Modify: `/home/junior/Projects/happy-team-chat/.gitignore`

- [ ] **Step 1: Conferir o terreno.**

```bash
cd /home/junior/Projects/happy-team-chat && git branch --show-current && git status --short && ls -a .claude 2>&1 | head
```

Esperado: branch `developer`, só `?? CLAUDE.md` pendente e sem `.claude/`. Se já existir um `settings.local.json`, **não sobrescreva**: junte o bloco `hooks` ao conteúdo existente.

- [ ] **Step 2: Ignorar o arquivo local antes de criá-lo.**

```bash
cd /home/junior/Projects/happy-team-chat && printf '\n# ganchos locais do Claude Code (Crivo)\n.claude/settings.local.json\n' >> .gitignore && mkdir -p .claude && git check-ignore -v .claude/settings.local.json
```

Esperado: a linha do `.gitignore` aparece na saída.

- [ ] **Step 3: Criar `.claude/settings.local.json`** exatamente com o conteúdo da seção "Configuração no happy-team-chat" da spec (`UserPromptSubmit` → `/api/ganchos/prompt`; `PreToolUse` com `matcher` `Bash|Write|Edit|MultiEdit|NotebookEdit` → `/api/ganchos/ferramenta`; `curl -s -m 2 -o /dev/null -H 'Content-Type: application/json' --data-binary @- http://127.0.0.1:4000/api/ganchos/… || true`; `timeout: 5`). Valide com `jq . .claude/settings.local.json`.

- [ ] **Step 4: Commit só do `.gitignore`.**

```bash
cd /home/junior/Projects/happy-team-chat && git add .gitignore && git status --short && git commit -m "Ignora os ganchos locais do Claude Code usados pelo Crivo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Esperado no `status` antes do commit: `M  .gitignore` e `?? CLAUDE.md`. O `settings.local.json` não aparece.

---

### Task 6: Verificação de verdade

**Files:** só o que a verificação revelar. Bugs passam por `superpowers:systematic-debugging`.

- [ ] **Step 1: Verificação estática completa**

```bash
cd /home/junior/Projects/crivo && corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test && corepack pnpm build
```

Esperado: tudo verde. No build, `/api/ganchos/prompt` e `/api/ganchos/ferramenta` aparecem como `ƒ`, e `/api/simular` não existe.

- [ ] **Step 2: Servidor de teste com banco descartável** (para não sujar o `data/crivo.db` do usuário)
  - `ss -ltnp | grep ':4000 '`. Se estiver ocupada por um processo que você não iniciou, **pare e peça ao usuário** para desligar o servidor dele.
  - `CRIVO_DB=<scratchpad>/crivo-teste.db corepack pnpm start` em segundo plano.

- [ ] **Step 3: O gancho de verdade, com o Crivo ligado.** Extraia o comando exato do arquivo do happy-team-chat e rode com pacotes no formato da documentação:

```bash
CFG=/home/junior/Projects/happy-team-chat/.claude/settings.local.json
CMD_P=$(jq -r '.hooks.UserPromptSubmit[0].hooks[0].command' $CFG)
CMD_F=$(jq -r '.hooks.PreToolUse[0].hooks[0].command' $CFG)
echo '{"session_id":"teste","cwd":"/home/junior/Projects/happy-team-chat","hook_event_name":"UserPromptSubmit","prompt":"teste do gancho\ncom duas linhas"}' | bash -c "$CMD_P"; echo "saida=$?"
echo '{"session_id":"teste","cwd":"/home/junior/Projects/happy-team-chat","hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"pnpm test"}}' | bash -c "$CMD_F"; echo "saida=$?"
echo '{"session_id":"teste","cwd":"/home/junior/Projects/happy-team-chat","hook_event_name":"PreToolUse","tool_name":"Edit","tool_input":{"file_path":"/home/junior/Projects/happy-team-chat/src/App.tsx"}}' | bash -c "$CMD_F"; echo "saida=$?"
curl -s http://127.0.0.1:4000/api/feed | jq '{prompts: [.prompts[].texto], comandos: [.comandos[].alvo], conexao}'
```

Esperado: `saida=0` três vezes, sem nenhuma outra saída; o feed com o prompt, `pnpm test`, o caminho do `App.tsx` e `conexao.conectado: true`.

- [ ] **Step 4: No navegador** (Playwright, em `http://127.0.0.1:4000`)
  - **Banco vazio:** antes do Step 3, ou num banco descartável novo, aparecem as duas mensagens de coluna vazia e "Esperando o happy-team-chat".
  - **Com a página aberta, mande um prompt pelo gancho:**
    - ele aparece no topo em ≤ ~1,5 s, sem recarregar
    - a lâmpada vira "happy-team-chat conectado", com "último sinal às …"
  - **Abra o prompt:** as duas linhas aparecem preservadas, a nota é "—" e aparece a frase "Ainda sem avaliação…".
  - **Console:** sem erros.
  - Remova a pasta `.playwright-mcp` que o Playwright cria em `/home/junior/Projects/happy-team-chat` ao terminar.

- [ ] **Step 5: Escuta só local.** `curl -s -m 2 -o /dev/null -w '%{http_code}' http://$(hostname -I | awk '{print $1}'):4000/` → esperado: falha de conexão (`000`). `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4000/` → `200`.

- [ ] **Step 6: Crivo desligado.** Pare o servidor que você iniciou e repita o prompt do Step 3 com `time`:

```bash
time (echo '{"cwd":"/home/junior/Projects/happy-team-chat","prompt":"crivo desligado"}' | bash -c "$CMD_P"; echo "saida=$?")
```

Esperado: `saida=0`, nenhuma outra saída, `real` < 2 s.

- [ ] **Step 7: Limpeza e commit das correções (se houver).** Apague o banco descartável do scratchpad. `git status` limpo nos dois repositórios (exceto o `CLAUDE.md` do usuário no happy-team-chat).

- [ ] **Step 8: Entregar.** Reporte as evidências e passe ao usuário o teste final: com `corepack pnpm dev` rodando no Crivo, mandar um prompt no Claude Code dentro do happy-team-chat. O banco real `data/crivo.db` é recriado vazio na primeira abertura (migração para a versão 2).
