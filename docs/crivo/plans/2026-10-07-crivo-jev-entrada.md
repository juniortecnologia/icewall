# Crivo etapa 3 — o Jev no portão de entrada: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** cada prompt do happy-team-chat é avaliado pelo Jev (TypeSafe) e o código do Crivo decide verde / amarelo (aviso ao Claude) / vermelho (bloqueio), com nota, tempo do Jev e uma área de teste no painel.

**Architecture:** `decisao.ts` guarda todas as regras como funções puras e recebe o avaliador injetado. `jev.ts` é o único arquivo que fala com a TypeSafe, pelo SDK oficial, e transforma toda falha em `FalhaJev`. As rotas (`respostas.ts`) juntam pacote → decisão → banco → saída do gancho. A tela reaproveita as mensagens de `decisao.ts` para mostrar o que o Claude recebeu.

**Tech Stack:** Next.js 16.4 (cacheComponents), TypeScript, Tailwind 4, better-sqlite3 13, Vitest 5, `@typesafe-ai/sdk` 0.6.0, pnpm via `corepack pnpm`.

**Spec:** `docs/superpowers/specs/2026-10-07-crivo-jev-entrada-design.md`

## Global Constraints

- Todos os comandos rodam em `/home/junior/Projects/crivo`, na branch `developer`. Nada de `main` nem push.
- pnpm sempre como `corepack pnpm`.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Identidade: `git -c user.name="Junior Almeida" -c user.email="junioralmeidatecnologia@gmail.com" commit …`.
- `LIMITE_FALTA = 0.5` (falta se `< 0,5`), `LIMITE_MISTURA = 0.6` (falta se `> 0,6`), `PALAVRAS_RESPOSTA_CURTA = 4`, `MARCA_PRESSA = ">>"`.
- Jev: limite de 8000 ms, **nenhuma nova tentativa** (`retry: { maxRetries: 0 }`), modelo padrão `jev-latest`, estado `{ projeto: "happy-team-chat: um chat de WhatsApp para equipes", pedido: <primeiros 20.000 caracteres> }`.
- A chave `TYPESAFE_API_KEY` fica só no servidor. **Nunca imprimir `.env.local`** nem a chave: em log, resposta ou tela.
- Textos da interface e mensagens em português, exatamente como na spec.
- Visual: monoespaçada, ícones SVG à mão, nada de emoji nem biblioteca de ícones. Use as cores de `globals.css` (`--color-verde`, `--color-ambar`, `--color-vermelho`, `--color-info`, `--color-apagado`, `--color-borda`).
- Leituras síncronas do SQLite em página exigem `await connection()`. As rotas POST não precisam.
- O Playwright MCP cria `.playwright-mcp/` no happy-team-chat: apague a pasta depois de cada uso.

## Review Focus

1. **O Jev devolve algo fora do formato** (um rótulo de tamanho desconhecido, um noul ausente ou `NaN`). O prompt deve passar como "não avaliado", sem quebrar a rota e sem gravar `NaN`. Teste na Tarefa 2.
2. **O avaliador lança exceção em vez de devolver `FalhaJev`.** `decidir` deve virar "falhou" e o prompt deve passar. Teste na Tarefa 1.
3. **A chave vazar em log ou resposta** quando a TypeSafe recusa (401). Teste na Tarefa 2, espiando `console.error`.
4. **Os prompts gravados na etapa 2** (`avaliacao` nula) devem continuar aparecendo, com "Registrado antes da avaliação com IA". Teste de migração na Tarefa 3; conferência visual na Tarefa 5.
5. **O tempo total do gancho** precisa ficar abaixo do `curl -m 10`: Jev até 8 s mais o banco. A primeira chamada do `next dev` compila a rota e pode estourar; nesse caso o prompt passa e é gravado do mesmo jeito. Medido de verdade na Tarefa 6.

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/tipos.ts` (mod.) | Tipos novos: `Criterio`, `Avaliacao`, `RespostaJev`, `FalhaJev`, `Avaliador`, `SaidaGancho`, `Decisao`, `PacotePrompt`. `Prompt` ganha 4 campos. |
| `src/lib/decisao.ts` (novo) | Regras puras, mensagens e rótulos. `decidir(texto, avaliar)`. |
| `src/lib/jev.ts` (novo) | `avaliarComJev`: as 5 perguntas, o SDK e o mapeamento de erros. |
| `src/lib/db.ts` (mod.) | Esquema v3, migração v2→v3 por `ALTER`, gravar e ler os campos novos. |
| `src/lib/ganchos.ts` (mod.) | `lerGanchoPrompt` passa a devolver `PacotePrompt`. |
| `src/lib/avaliacao.ts` (mod.) | Saem `calcularNota` e `semaforoDoPrompt`, que ficam sem uso. |
| `src/lib/respostas.ts` (mod.) | O gancho de prompt decide e responde a saída. Nova `respostaAvaliar`. |
| `src/app/api/avaliar/route.ts` (novo) | Rota POST da área de teste. |
| `src/lib/hora.ts` (mod.) | `formatarDuracao(ms)` → "1,3 s". |
| `src/components/DetalheAvaliacao.tsx` (novo) | Corpo do item aberto, compartilhado com a área de teste. |
| `src/components/TestarPrompt.tsx` (novo) | Botão mais `<dialog>` da área de teste. |
| `src/components/ItemPrompt.tsx` (mod.) | Nota só quando avaliado pelo Jev, "Jev 1,3 s" e uso de `DetalheAvaliacao`. |
| `src/components/Painel.tsx` (mod.) | `Cabecalho` ganha o espaço `acao` e o Painel põe `TestarPrompt` nele. |
| `/home/junior/Projects/happy-team-chat/.claude/settings.local.json` (mod., sem commit) | O comando do gancho de prompt. |

---

### Task 1: Tipos e regras de decisão

**Files:**
- Modify: `src/lib/tipos.ts` (acrescentar ao fim)
- Create: `src/lib/decisao.ts`
- Test: `tests/decisao.test.ts`

**Interfaces:**
- Consumes: `limitarPct(n: number): number` de `src/lib/avaliacao.ts`; `Tamanho`, `Semaforo`, `Criterios` de `tipos.ts`.
- Produces (em `tipos.ts`):
  - `Criterio = "objetivo" | "onde" | "pronto" | "mistura"`
  - `Avaliacao = "jev" | "pressa" | "curta" | "falhou"`
  - `RespostaJev { ok: true; tamanho: Tamanho; probTamanho: Record<Tamanho, number>; objetivo: number; onde: number; pronto: number; mistura: number; duracaoMs: number }`
  - `FalhaJev { ok: false; motivo: string; duracaoMs: number }`
  - `Avaliador = (texto: string) => Promise<RespostaJev | FalhaJev>`
  - `SaidaGancho { decision?: "block"; reason?: string; hookSpecificOutput?: { hookEventName: "UserPromptSubmit"; additionalContext: string } }`
  - `Decisao { semaforo; nota: number | null; criterios: Criterios | null; faltando: Criterio[] | null; avaliacao: Avaliacao; motivo: string | null; duracaoMs: number | null; saidaGancho: SaidaGancho }`
- Produces (em `decisao.ts`): as constantes `LIMITE_FALTA`, `LIMITE_MISTURA`, `PALAVRAS_RESPOSTA_CURTA`, `MARCA_PRESSA`, `ROTULO_FALTA: Record<Criterio, string>` e `MENSAGEM_PRESSA`, além de:
  - `juntarComE(itens: string[]): string`
  - `mensagemAviso(faltando: Criterio[]): string`
  - `mensagemBloqueio(nota: number, faltando: Criterio[]): string`
  - `triagem(texto: string): "pressa" | "curta" | null`
  - `decidirComJev(r: RespostaJev): Decisao`
  - `decidir(texto: string, avaliar: Avaliador): Promise<Decisao>`

- [ ] **Step 1: Acrescentar os tipos ao fim de `src/lib/tipos.ts`**

```ts
/** Os critérios que podem faltar num pedido, na ordem em que são listados. */
export type Criterio = "objetivo" | "onde" | "pronto" | "mistura";

/** Como o prompt foi tratado: pelo Jev, pela marca de pressa, por ser curto, ou o Jev falhou. */
export type Avaliacao = "jev" | "pressa" | "curta" | "falhou";

/** O que o Jev respondeu, em chances de 0 a 1. */
export interface RespostaJev {
  ok: true;
  tamanho: Tamanho;
  probTamanho: Record<Tamanho, number>;
  objetivo: number;
  onde: number;
  pronto: number;
  mistura: number;
  duracaoMs: number;
}

/** O Jev não respondeu: o prompt passa como "não avaliado". */
export interface FalhaJev {
  ok: false;
  motivo: string;
  duracaoMs: number;
}

export type Avaliador = (texto: string) => Promise<RespostaJev | FalhaJev>;

/** Saída do gancho UserPromptSubmit. Vazia = segue em silêncio. */
export interface SaidaGancho {
  decision?: "block";
  reason?: string;
  hookSpecificOutput?: { hookEventName: "UserPromptSubmit"; additionalContext: string };
}

export interface Decisao {
  semaforo: Semaforo;
  nota: number | null;
  criterios: Criterios | null;
  faltando: Criterio[] | null;
  avaliacao: Avaliacao;
  motivo: string | null;
  duracaoMs: number | null;
  saidaGancho: SaidaGancho;
}
```

- [ ] **Step 2: Escrever o teste que falha, `tests/decisao.test.ts`**

```ts
import { describe, expect, it, vi } from "vitest";
import {
  MENSAGEM_PRESSA,
  decidir,
  decidirComJev,
  juntarComE,
  mensagemAviso,
  mensagemBloqueio,
  triagem,
} from "@/lib/decisao";
import type { Criterio, RespostaJev, Tamanho } from "@/lib/tipos";

const resposta = (extra: Partial<RespostaJev> = {}): RespostaJev => ({
  ok: true,
  tamanho: "funcionalidade",
  probTamanho: { ajuste: 0, funcionalidade: 1, sistema: 0 },
  objetivo: 0.9,
  onde: 0.9,
  pronto: 0.9,
  mistura: 0.1,
  duracaoMs: 1234,
  ...extra,
});

/** Liga a falta dos n primeiros critérios, na ordem objetivo, onde, pronto, mistura. */
const comFaltas = (tamanho: Tamanho, n: number) =>
  resposta({
    tamanho,
    objetivo: n >= 1 ? 0.2 : 0.9,
    onde: n >= 2 ? 0.2 : 0.9,
    pronto: n >= 3 ? 0.2 : 0.9,
    mistura: n >= 4 ? 0.9 : 0.1,
  });

describe("limites", () => {
  it("objetivo, onde e pronto faltam abaixo de 0,5; 0,5 já não falta", () => {
    expect(decidirComJev(resposta({ objetivo: 0.49 })).faltando).toEqual(["objetivo"]);
    expect(decidirComJev(resposta({ objetivo: 0.5 })).faltando).toEqual([]);
    expect(decidirComJev(resposta({ onde: 0.49 })).faltando).toEqual(["onde"]);
    expect(decidirComJev(resposta({ pronto: 0.49 })).faltando).toEqual(["pronto"]);
  });
  it("mistura falta acima de 0,6; 0,6 ainda não falta", () => {
    expect(decidirComJev(resposta({ mistura: 0.6 })).faltando).toEqual([]);
    expect(decidirComJev(resposta({ mistura: 0.61 })).faltando).toEqual(["mistura"]);
  });
});

describe("ajuste pequeno", () => {
  it("passa verde mesmo sem onde, pronto e foco, se o objetivo é claro", () => {
    const d = decidirComJev(resposta({ tamanho: "ajuste", onde: 0.1, pronto: 0.1, mistura: 0.9 }));
    expect(d.semaforo).toBe("verde");
    expect(d.faltando).toEqual([]);
    expect(d.saidaGancho).toEqual({});
  });
  it("sem objetivo claro vira amarelo, e só o objetivo conta como faltando", () => {
    const d = decidirComJev(resposta({ tamanho: "ajuste", objetivo: 0.2, onde: 0.1, pronto: 0.1, mistura: 0.9 }));
    expect(d.semaforo).toBe("amarelo");
    expect(d.faltando).toEqual(["objetivo"]);
  });
});

describe("funcionalidade e sistema", () => {
  it.each([
    ["funcionalidade", 0, "verde"],
    ["funcionalidade", 1, "amarelo"],
    ["funcionalidade", 2, "amarelo"],
    ["funcionalidade", 3, "vermelho"],
    ["funcionalidade", 4, "vermelho"],
    ["sistema", 0, "verde"],
    ["sistema", 1, "amarelo"],
    ["sistema", 2, "amarelo"],
    ["sistema", 3, "vermelho"],
    ["sistema", 4, "vermelho"],
  ] as const)("%s com %i faltando → %s", (tamanho, n, cor) => {
    const d = decidirComJev(comFaltas(tamanho, n));
    expect(d.semaforo).toBe(cor);
    expect(d.faltando).toHaveLength(n);
    expect(d.avaliacao).toBe("jev");
  });
});

describe("nota e critérios", () => {
  it("nota = média de objetivo, onde, pronto e (1 − mistura)", () => {
    const d = decidirComJev(resposta({ objetivo: 0.8, onde: 0.6, pronto: 0.4, mistura: 0.2 }));
    expect(d.nota).toBe(65);
    expect(d.criterios).toEqual({
      tamanho: "funcionalidade",
      tamanhoPct: 50,
      objetivoPct: 80,
      ondePct: 60,
      prontoPct: 40,
      focoPct: 80,
    });
    expect(d.duracaoMs).toBe(1234);
  });
  it("tamanhoPct = 0,5·funcionalidade + sistema", () => {
    const d = decidirComJev(resposta({ probTamanho: { ajuste: 0.2, funcionalidade: 0.6, sistema: 0.2 } }));
    expect(d.criterios?.tamanhoPct).toBe(50);
  });
});

describe("mensagens", () => {
  it("juntarComE: um, dois e três itens", () => {
    expect(juntarComE(["a"])).toBe("a");
    expect(juntarComE(["a", "b"])).toBe("a e b");
    expect(juntarComE(["a", "b", "c"])).toBe("a, b e c");
  });
  it("amarelo: o Claude recebe o aviso exato em additionalContext", () => {
    const d = decidirComJev(resposta({ onde: 0.2, pronto: 0.2 }));
    expect(d.saidaGancho).toEqual({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext:
          "Aviso do Crivo: neste pedido faltou em que tela ou parte do projeto mexer e como saber que ficou pronto. O usuário prefere que você pergunte isso antes de começar: faça as perguntas primeiro e só comece depois das respostas.",
      },
    });
  });
  it("vermelho: bloqueia com o motivo exato", () => {
    const d = decidirComJev(resposta({ objetivo: 0.2, onde: 0.2, pronto: 0.2, mistura: 0.2 }));
    expect(d.nota).toBe(35);
    expect(d.saidaGancho).toEqual({
      decision: "block",
      reason:
        "O Crivo barrou este prompt (nota 35). Faltou: um objetivo claro (duas pessoas poderiam entender coisas diferentes); em que tela ou parte do projeto mexer; como saber que ficou pronto. Reescreva incluindo isso, ou comece com >> para passar sem avaliação.",
    });
  });
  it("mensagemAviso e mensagemBloqueio usam os rótulos na ordem dada", () => {
    const f: Criterio[] = ["mistura"];
    expect(mensagemAviso(f)).toContain("faltou uma tarefa só (o pedido mistura várias).");
    expect(mensagemBloqueio(10, f)).toContain("(nota 10). Faltou: uma tarefa só (o pedido mistura várias).");
  });
});

describe("triagem", () => {
  it.each([
    [">> faz tudo do jeito que achar melhor", "pressa"],
    ["   >>faz tudo", "pressa"],
    [">>", "pressa"],
    ["sim", "curta"],
    ["pode continuar exatamente daqui", "curta"],
    ["a\n\n b", "curta"],
    ["pode continuar exatamente daqui agora", null],
    ["faz o relatório >> depois", null],
  ] as const)("%j → %s", (texto, esperado) => {
    expect(triagem(texto)).toBe(esperado);
  });
});

describe("decidir", () => {
  const longo = "cria a tela de relatórios de atendimento com filtros por período";

  it("pressa: verde, sem chamar o Jev, e o Claude recebe a linha de ignorar a marca", async () => {
    const avaliar = vi.fn();
    const d = await decidir(">> faz o que eu pedi antes", avaliar);
    expect(avaliar).not.toHaveBeenCalled();
    expect(d).toMatchObject({ semaforo: "verde", avaliacao: "pressa", nota: null, criterios: null, faltando: null });
    expect(d.saidaGancho.hookSpecificOutput?.additionalContext).toBe(MENSAGEM_PRESSA);
    expect(MENSAGEM_PRESSA).toBe('O ">>" no começo do prompt é só a marca de pressa do usuário para o Crivo; ignore.');
  });

  it("resposta curta: verde, sem chamar o Jev, saída vazia", async () => {
    const avaliar = vi.fn();
    const d = await decidir("aprovado", avaliar);
    expect(avaliar).not.toHaveBeenCalled();
    expect(d).toMatchObject({ semaforo: "verde", avaliacao: "curta", saidaGancho: {} });
  });

  it("5 palavras ou mais: chama o Jev uma vez com o texto", async () => {
    const avaliar = vi.fn().mockResolvedValue(resposta());
    const d = await decidir(longo, avaliar);
    expect(avaliar).toHaveBeenCalledExactlyOnceWith(longo);
    expect(d.avaliacao).toBe("jev");
  });

  it("Jev falhou: verde, 'falhou', com o motivo e o tempo, saída vazia", async () => {
    const d = await decidir(longo, async () => ({ ok: false, motivo: "TypeSafe indisponível", duracaoMs: 300 }));
    expect(d).toEqual({
      semaforo: "verde",
      nota: null,
      criterios: null,
      faltando: null,
      avaliacao: "falhou",
      motivo: "TypeSafe indisponível",
      duracaoMs: 300,
      saidaGancho: {},
    });
  });

  it("avaliador que lança exceção vira 'falhou' e o prompt passa", async () => {
    const d = await decidir(longo, async () => {
      throw new Error("boom");
    });
    expect(d).toMatchObject({ semaforo: "verde", avaliacao: "falhou", motivo: "erro ao falar com a TypeSafe", saidaGancho: {} });
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `corepack pnpm exec vitest run tests/decisao.test.ts`
Expected: FAIL, porque `@/lib/decisao` não existe ("Failed to resolve import" / "Cannot find module").

- [ ] **Step 4: Criar `src/lib/decisao.ts`**

```ts
import { limitarPct } from "./avaliacao";
import type { Avaliador, Criterio, Criterios, Decisao, FalhaJev, RespostaJev, SaidaGancho, Semaforo } from "./tipos";

// O Jev só dá chances; quem decide a cor é este arquivo.

/** objetivo, onde e pronto faltam quando a chance fica abaixo disto. */
export const LIMITE_FALTA = 0.5;
/** mistura falta (o pedido junta várias tarefas) quando a chance passa disto. */
export const LIMITE_MISTURA = 0.6;
/** Até este número de palavras é resposta de conversa ("sim", "pode continuar"): passa sem o Jev. */
export const PALAVRAS_RESPOSTA_CURTA = 4;
/** Prompt que começa com isto passa direto, sem avaliação. */
export const MARCA_PRESSA = ">>";

export const ROTULO_FALTA: Record<Criterio, string> = {
  objetivo: "um objetivo claro (duas pessoas poderiam entender coisas diferentes)",
  onde: "em que tela ou parte do projeto mexer",
  pronto: "como saber que ficou pronto",
  mistura: "uma tarefa só (o pedido mistura várias)",
};

export const MENSAGEM_PRESSA = 'O ">>" no começo do prompt é só a marca de pressa do usuário para o Crivo; ignore.';

const MOTIVO_EXCECAO = "erro ao falar com a TypeSafe";

/** "a", "a e b", "a, b e c". */
export function juntarComE(itens: string[]): string {
  if (itens.length <= 1) return itens.join("");
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

const rotulos = (faltando: Criterio[]) => faltando.map((c) => ROTULO_FALTA[c]);

export function mensagemAviso(faltando: Criterio[]): string {
  return `Aviso do Crivo: neste pedido faltou ${juntarComE(rotulos(faltando))}. O usuário prefere que você pergunte isso antes de começar: faça as perguntas primeiro e só comece depois das respostas.`;
}

export function mensagemBloqueio(nota: number, faltando: Criterio[]): string {
  return `O Crivo barrou este prompt (nota ${nota}). Faltou: ${rotulos(faltando).join("; ")}. Reescreva incluindo isso, ou comece com >> para passar sem avaliação.`;
}

const contexto = (texto: string): SaidaGancho => ({
  hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: texto },
});

/** As regras que dispensam o Jev. */
export function triagem(texto: string): "pressa" | "curta" | null {
  const limpo = texto.trim();
  if (limpo.startsWith(MARCA_PRESSA)) return "pressa";
  if (limpo.split(/\s+/).length <= PALAVRAS_RESPOSTA_CURTA) return "curta";
  return null;
}

function decidirSemJev(tipo: "pressa" | "curta"): Decisao {
  return {
    semaforo: "verde",
    nota: null,
    criterios: null,
    faltando: null,
    avaliacao: tipo,
    motivo: null,
    duracaoMs: null,
    saidaGancho: tipo === "pressa" ? contexto(MENSAGEM_PRESSA) : {},
  };
}

function decidirFalha(f: FalhaJev): Decisao {
  return {
    semaforo: "verde",
    nota: null,
    criterios: null,
    faltando: null,
    avaliacao: "falhou",
    motivo: f.motivo,
    duracaoMs: f.duracaoMs,
    saidaGancho: {},
  };
}

export function decidirComJev(r: RespostaJev): Decisao {
  const todos: Criterio[] = [];
  if (r.objetivo < LIMITE_FALTA) todos.push("objetivo");
  if (r.onde < LIMITE_FALTA) todos.push("onde");
  if (r.pronto < LIMITE_FALTA) todos.push("pronto");
  if (r.mistura > LIMITE_MISTURA) todos.push("mistura");
  // Num ajuste pequeno só o objetivo conta; então ele nunca passa de amarelo.
  const faltando = r.tamanho === "ajuste" ? todos.filter((c) => c === "objetivo") : todos;
  const semaforo: Semaforo = faltando.length === 0 ? "verde" : faltando.length <= 2 ? "amarelo" : "vermelho";

  const nota = limitarPct((100 * (r.objetivo + r.onde + r.pronto + (1 - r.mistura))) / 4);
  const criterios: Criterios = {
    tamanho: r.tamanho,
    tamanhoPct: limitarPct(100 * (0.5 * r.probTamanho.funcionalidade + r.probTamanho.sistema)),
    objetivoPct: limitarPct(100 * r.objetivo),
    ondePct: limitarPct(100 * r.onde),
    prontoPct: limitarPct(100 * r.pronto),
    focoPct: limitarPct(100 * (1 - r.mistura)),
  };
  const saidaGancho: SaidaGancho =
    semaforo === "vermelho"
      ? { decision: "block", reason: mensagemBloqueio(nota, faltando) }
      : semaforo === "amarelo"
        ? contexto(mensagemAviso(faltando))
        : {};

  return { semaforo, nota, criterios, faltando, avaliacao: "jev", motivo: null, duracaoMs: r.duracaoMs, saidaGancho };
}

/** A primeira regra que vale encerra: pressa, resposta curta, falha do Jev, regras do Jev. */
export async function decidir(texto: string, avaliar: Avaliador): Promise<Decisao> {
  const tipo = triagem(texto);
  if (tipo) return decidirSemJev(tipo);
  let r: RespostaJev | FalhaJev;
  try {
    r = await avaliar(texto);
  } catch (erro) {
    console.error("[crivo] avaliador lançou exceção", erro);
    r = { ok: false, motivo: MOTIVO_EXCECAO, duracaoMs: 0 };
  }
  return r.ok ? decidirComJev(r) : decidirFalha(r);
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `corepack pnpm exec vitest run tests/decisao.test.ts`
Expected: PASS em todos os testes do arquivo. O teste da exceção imprime um `console.error`, e isso é esperado.

- [ ] **Step 6: Typecheck e commit**

Run: `corepack pnpm typecheck`
Expected: sem erros.

```bash
git add src/lib/tipos.ts src/lib/decisao.ts tests/decisao.test.ts
git -c user.name="Junior Almeida" -c user.email="junioralmeidatecnologia@gmail.com" commit -m "Regras do portão de entrada: pressa, resposta curta, limites e mensagens

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: O Jev pelo SDK da TypeSafe

**Files:**
- Modify: `package.json` / `pnpm-lock.yaml` (dependência `@typesafe-ai/sdk`)
- Create: `src/lib/jev.ts`
- Test: `tests/jev.test.ts`

**Interfaces:**
- Consumes: `RespostaJev`, `FalhaJev`, `Tamanho` (Task 1); `chaveCarregada(valor: string | undefined): boolean` de `src/lib/ambiente.ts`.
- Produces:
  - `avaliarComJev(texto: string, opcoes?: OpcoesJev): Promise<RespostaJev | FalhaJev>`, que nunca lança e é compatível com `Avaliador`;
  - `OpcoesJev { apiKey?: string; fetch?: Fetch; timeoutMs?: number }`;
  - as constantes `PROJETO`, `LIMITE_JEV_MS = 8000`, `MAX_CARACTERES_JEV = 20_000` e `PERGUNTAS`.

Fatos do SDK 0.6.0, conferidos no código-fonte (`src/client.ts`, `src/types.ts`, `src/errors.ts`):
- `new TypeSafeClient({ apiKey, fetch, timeout, retry: { maxRetries }, logLevel })`. Com a chave vazia, o construtor **lança** `TypeSafeError`.
- `client.systemOne({ state, questions })` devolve `{ model, answers, usage }`.
- `choice(instructions, criteria)` e `noul(instructions, criteria?)` são exportados da raiz do pacote.
- A resposta choice tem `{ type, choice, probabilities, confidence }`; a noul tem `{ type, noul }`.
- Erros:
  - `APIError` tem `.status`, com as subclasses `AuthenticationError` (401), `RateLimitError` (429) e `InternalServerError` (≥ 500);
  - `APITimeoutError extends APIConnectionError` é lançado quando o tempo estoura.
- O tipo do `fetch` é `(input: string, init?: RequestInit) => Promise<Response>`, exportado como `Fetch`.

- [ ] **Step 1: Instalar o SDK**

Run: `corepack pnpm add @typesafe-ai/sdk@0.6.0`
Expected: `package.json` ganha `"@typesafe-ai/sdk": "0.6.0"` em `dependencies`. Confira com `ls node_modules/@typesafe-ai/sdk/dist`. Se a versão instalada não for 0.6.0, leia `node_modules/@typesafe-ai/sdk/dist/*.d.ts` e confira os nomes listados acima antes de seguir.

- [ ] **Step 2: Escrever o teste que falha, `tests/jev.test.ts`**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_CARACTERES_JEV, PROJETO, avaliarComJev } from "@/lib/jev";

const CHAVE = "ts_teste_segredo_123";

const respostaApi = {
  model: "jev-latest",
  usage: { input_tokens: 10, output_tokens: 5 },
  answers: {
    tamanho: {
      type: "choice",
      choice: "funcionalidade",
      probabilities: { ajuste: 0.1, funcionalidade: 0.7, sistema: 0.2 },
      confidence: 0.6,
    },
    objetivo: { type: "noul", noul: 0.8 },
    onde: { type: "noul", noul: 0.3 },
    pronto: { type: "noul", noul: 0.55 },
    mistura: { type: "noul", noul: 0.1 },
  },
};

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

/** fetch falso que guarda cada chamada e responde sempre a mesma coisa. */
function fetchFalso(responder: () => Response) {
  const chamadas: { url: string; corpo: Record<string, unknown> }[] = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    chamadas.push({ url, corpo: JSON.parse(String(init?.body)) });
    return responder();
  });
  return { fn, chamadas };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("avaliarComJev", () => {
  it("manda o estado e as 5 perguntas numa chamada só e devolve as chances", async () => {
    const { fn, chamadas } = fetchFalso(() => json(respostaApi));
    const r = await avaliarComJev("cria a tela de relatórios de atendimento", { apiKey: CHAVE, fetch: fn });

    expect(fn).toHaveBeenCalledOnce();
    expect(chamadas[0].url).toMatch(/\/v1\/systemone$/);
    const corpo = chamadas[0].corpo as {
      model: string;
      state: unknown;
      questions: Record<string, { type: string; instructions: string; criteria: Record<string, string> }>;
    };
    expect(corpo.model).toBe("jev-latest");
    expect(corpo.state).toEqual({ projeto: PROJETO, pedido: "cria a tela de relatórios de atendimento" });
    expect(PROJETO).toBe("happy-team-chat: um chat de WhatsApp para equipes");
    expect(Object.keys(corpo.questions)).toEqual(["tamanho", "objetivo", "onde", "pronto", "mistura"]);
    expect(corpo.questions.tamanho.type).toBe("choice");
    expect(Object.keys(corpo.questions.tamanho.criteria)).toEqual(["ajuste", "funcionalidade", "sistema"]);
    for (const id of ["objetivo", "onde", "pronto", "mistura"]) {
      expect(corpo.questions[id].type).toBe("noul");
      expect(Object.keys(corpo.questions[id].criteria)).toEqual(["true", "false"]);
    }
    expect(corpo.questions.objetivo.instructions).toBe(
      "Duas pessoas diferentes, lendo o `pedido`, entenderiam a mesma coisa sobre o que deve ser feito?",
    );

    expect(r).toEqual({
      ok: true,
      tamanho: "funcionalidade",
      probTamanho: { ajuste: 0.1, funcionalidade: 0.7, sistema: 0.2 },
      objetivo: 0.8,
      onde: 0.3,
      pronto: 0.55,
      mistura: 0.1,
      duracaoMs: expect.any(Number),
    });
  });

  it("prompt enorme: o Jev recebe só os primeiros 20.000 caracteres", async () => {
    const { fn, chamadas } = fetchFalso(() => json(respostaApi));
    await avaliarComJev("x".repeat(25_000), { apiKey: CHAVE, fetch: fn });
    const estado = chamadas[0].corpo.state as { pedido: string };
    expect(estado.pedido).toHaveLength(MAX_CARACTERES_JEV);
  });

  it("sem chave: não chama a rede", async () => {
    const { fn } = fetchFalso(() => json(respostaApi));
    const r = await avaliarComJev("cria a tela de relatórios de atendimento", { apiKey: "   ", fetch: fn });
    expect(fn).not.toHaveBeenCalled();
    expect(r).toEqual({ ok: false, motivo: "sem chave TypeSafe", duracaoMs: 0 });
  });

  it.each([
    [401, "TypeSafe recusou a chave"],
    [429, "limite de uso da TypeSafe"],
    [529, "TypeSafe indisponível"],
    [500, "TypeSafe indisponível"],
    [422, "erro ao falar com a TypeSafe"],
  ])("HTTP %i → %s, sem nova tentativa", async (status, motivo) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { fn } = fetchFalso(() => json({ error: "x" }, status));
    const r = await avaliarComJev("cria a tela de relatórios de atendimento", { apiKey: CHAVE, fetch: fn });
    expect(fn).toHaveBeenCalledOnce();
    expect(r).toMatchObject({ ok: false, motivo });
  });

  it("tempo esgotado → 'o Jev não respondeu em 8 s'", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const nuncaResponde = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_, rejeitar) => {
          init?.signal?.addEventListener("abort", () => rejeitar(init.signal?.reason));
        }),
    );
    const r = await avaliarComJev("cria a tela de relatórios de atendimento", {
      apiKey: CHAVE,
      fetch: nuncaResponde,
      timeoutMs: 30,
    });
    expect(nuncaResponde).toHaveBeenCalledOnce();
    expect(r).toMatchObject({ ok: false, motivo: "o Jev não respondeu em 8 s" });
  });

  it.each([
    ["tamanho desconhecido", { ...respostaApi.answers, tamanho: { ...respostaApi.answers.tamanho, choice: "gigante" } }],
    ["noul ausente", { ...respostaApi.answers, onde: { type: "noul" } }],
    ["noul que não é número", { ...respostaApi.answers, pronto: { type: "noul", noul: "alto" } }],
  ])("resposta fora do formato (%s) vira falha, sem NaN", async (_, answers) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { fn } = fetchFalso(() => json({ ...respostaApi, answers }));
    const r = await avaliarComJev("cria a tela de relatórios de atendimento", { apiKey: CHAVE, fetch: fn });
    expect(r).toMatchObject({ ok: false, motivo: "erro ao falar com a TypeSafe" });
  });

  it("a chave nunca aparece no log nem na falha", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    const { fn } = fetchFalso(() => json({ error: "invalid key" }, 401));
    const r = await avaliarComJev("cria a tela de relatórios de atendimento", { apiKey: CHAVE, fetch: fn });
    expect(erro).toHaveBeenCalled();
    expect(JSON.stringify(erro.mock.calls)).not.toContain(CHAVE);
    expect(JSON.stringify(r)).not.toContain(CHAVE);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `corepack pnpm exec vitest run tests/jev.test.ts`
Expected: FAIL, porque `@/lib/jev` não existe.

- [ ] **Step 4: Criar `src/lib/jev.ts`**

```ts
import { APIError, APITimeoutError, TypeSafeClient, choice, noul, type Fetch } from "@typesafe-ai/sdk";
import { chaveCarregada } from "./ambiente";
import type { FalhaJev, RespostaJev, Tamanho } from "./tipos";

// Único ponto do Crivo que fala com a TypeSafe. Só roda no servidor: a chave nunca sai daqui.

export const PROJETO = "happy-team-chat: um chat de WhatsApp para equipes";
export const LIMITE_JEV_MS = 8000;
export const MAX_CARACTERES_JEV = 20_000;

export const PERGUNTAS = {
  tamanho: choice("Qual o tamanho do trabalho que o `pedido` pede, considerando o `projeto`?", {
    ajuste: "Ajuste pequeno: corrigir, trocar ou ajustar algo pontual que já existe (um texto, um botão, um bug).",
    funcionalidade: "Funcionalidade nova: uma tela, fluxo ou recurso novo dentro do projeto.",
    sistema: "Sistema inteiro: um módulo grande, várias telas ou uma reestruturação do projeto.",
  }),
  objetivo: noul("Duas pessoas diferentes, lendo o `pedido`, entenderiam a mesma coisa sobre o que deve ser feito?", {
    true: "O resultado esperado é específico e só admite uma leitura.",
    false: "É vago, ambíguo ou aberto a interpretações diferentes.",
  }),
  onde: noul("O `pedido` diz em que tela, arquivo ou parte do `projeto` mexer?", {
    true: "Nomeia a tela, o arquivo, o componente ou a área do projeto.",
    false: "Não diz onde a mudança acontece.",
  }),
  pronto: noul("O `pedido` diz como saber que ficou pronto: o que tem que aparecer, funcionar ou passar?", {
    true: "Descreve o resultado verificável ou o critério de aceite.",
    false: "Não diz como conferir que terminou.",
  }),
  mistura: noul("O `pedido` junta duas ou mais tarefas independentes, que poderiam ser pedidas separadamente?", {
    true: "Duas ou mais tarefas sem relação entre si no mesmo pedido.",
    false: "Uma tarefa só, mesmo que tenha vários passos.",
  }),
};

const TAMANHOS: readonly Tamanho[] = ["ajuste", "funcionalidade", "sistema"];

export interface OpcoesJev {
  /** Padrão: TYPESAFE_API_KEY. */
  apiKey?: string;
  /** Para testes sem rede. */
  fetch?: Fetch;
  /** Padrão: LIMITE_JEV_MS. */
  timeoutMs?: number;
}

/** Chance de 0 a 1, ou erro: resposta fora do formato não pode virar NaN no banco. */
function chance(valor: unknown, campo: string): number {
  if (typeof valor !== "number" || !Number.isFinite(valor)) throw new Error(`resposta do Jev sem chance em "${campo}"`);
  return valor;
}

function motivoDoErro(erro: unknown): string {
  if (erro instanceof APITimeoutError) return `o Jev não respondeu em ${LIMITE_JEV_MS / 1000} s`;
  if (erro instanceof APIError) {
    if (erro.status === 401) return "TypeSafe recusou a chave";
    if (erro.status === 429) return "limite de uso da TypeSafe";
    if (erro.status >= 500) return "TypeSafe indisponível";
  }
  return "erro ao falar com a TypeSafe";
}

/** Faz as 5 perguntas numa chamada só. Nunca lança: toda falha vira FalhaJev. */
export async function avaliarComJev(texto: string, opcoes: OpcoesJev = {}): Promise<RespostaJev | FalhaJev> {
  const apiKey = opcoes.apiKey ?? process.env.TYPESAFE_API_KEY;
  if (!chaveCarregada(apiKey)) return { ok: false, motivo: "sem chave TypeSafe", duracaoMs: 0 };

  const inicio = performance.now();
  const duracao = () => Math.round(performance.now() - inicio);
  try {
    const cliente = new TypeSafeClient({
      apiKey,
      fetch: opcoes.fetch,
      timeout: opcoes.timeoutMs ?? LIMITE_JEV_MS,
      retry: { maxRetries: 0 },
      logLevel: "off",
    });
    const { answers } = await cliente.systemOne({
      state: { projeto: PROJETO, pedido: texto.slice(0, MAX_CARACTERES_JEV) },
      questions: PERGUNTAS,
    });
    const tamanho = answers.tamanho.choice;
    if (!TAMANHOS.includes(tamanho)) throw new Error(`tamanho desconhecido do Jev: "${String(tamanho)}"`);
    const p = answers.tamanho.probabilities;
    return {
      ok: true,
      tamanho,
      probTamanho: {
        ajuste: chance(p.ajuste ?? 0, "ajuste"),
        funcionalidade: chance(p.funcionalidade ?? 0, "funcionalidade"),
        sistema: chance(p.sistema ?? 0, "sistema"),
      },
      objetivo: chance(answers.objetivo.noul, "objetivo"),
      onde: chance(answers.onde.noul, "onde"),
      pronto: chance(answers.pronto.noul, "pronto"),
      mistura: chance(answers.mistura.noul, "mistura"),
      duracaoMs: duracao(),
    };
  } catch (erro) {
    const motivo = motivoDoErro(erro);
    // Só a mensagem do erro: os cabeçalhos (com a chave) nunca vão para o log.
    console.error(`[crivo] Jev falhou (${motivo}): ${erro instanceof Error ? erro.message : String(erro)}`);
    return { ok: false, motivo, duracaoMs: duracao() };
  }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `corepack pnpm exec vitest run tests/jev.test.ts`
Expected: PASS em todos. Se o teste de tempo esgotado der `erro ao falar com a TypeSafe` em vez do motivo dos 8 s, confira em `node_modules/@typesafe-ai/sdk` qual erro o SDK lança no tempo esgotado e ajuste `motivoDoErro`. É o código que se adapta ao SDK, não o teste.

- [ ] **Step 6: Typecheck e commit**

Run: `corepack pnpm typecheck`
Expected: sem erros. Se `answers.tamanho.choice` vier tipado como `string`, troque o `includes` por `(TAMANHOS as readonly string[]).includes(tamanho)` e faça um cast `tamanho as Tamanho` no retorno.

```bash
git add package.json pnpm-lock.yaml src/lib/jev.ts tests/jev.test.ts
git -c user.name="Junior Almeida" -c user.email="junioralmeidatecnologia@gmail.com" commit -m "O Jev: as 5 perguntas numa chamada, 8 s de limite e falhas em português

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Esquema v3, pacote do gancho e limpeza da régua antiga

**Files:**
- Modify: `src/lib/tipos.ts` (`Prompt`, `NovoPrompt` e o novo `PacotePrompt`)
- Modify: `src/lib/db.ts`
- Modify: `src/lib/ganchos.ts:21-33`
- Modify: `src/lib/avaliacao.ts` (sair `calcularNota` e `semaforoDoPrompt`)
- Test: `tests/db.test.ts`, `tests/ganchos.test.ts`, `tests/avaliacao.test.ts`

**Interfaces:**
- Consumes: `Avaliacao` e `Criterio` (Task 1).
- Produces:
  - `Prompt` ganha `avaliacao: Avaliacao | null`, `duracaoMs: number | null`, `faltando: Criterio[] | null` e `motivo: string | null`;
  - `NovoPrompt = Omit<Prompt, "id">`, que agora **inclui `semaforo`**: quem grava decide a cor;
  - `PacotePrompt = Pick<Prompt, "texto" | "criadoEm" | "origem" | "sessao">`;
  - `lerGanchoPrompt(corpo, agora): PacotePrompt | null`;
  - `inserirPrompt(db, p: NovoPrompt): Prompt`;
  - `VERSAO_ESQUEMA = 3`.

- [ ] **Step 1: Atualizar os testes**

Em `tests/db.test.ts`, troque o helper `novoPrompt` e o teste "com nota" e acrescente o teste de migração v2→v3:

```ts
const novoPrompt = (extra: Partial<NovoPrompt> = {}): NovoPrompt => ({
  texto: "corrige o login",
  criadoEm: "2026-10-07T12:00:00.000Z",
  origem: "happy-team-chat",
  sessao: "sess-1",
  criterios: null,
  nota: null,
  semaforo: "verde",
  avaliacao: "curta",
  duracaoMs: null,
  faltando: null,
  motivo: null,
  ...extra,
});
```

No `describe("prompts")`, troque o teste `"sem nota: grava, lê igual, fica verde e conta em 'passaram'"` por este (o semáforo agora vem de quem grava):

```ts
  it("sem nota: grava, lê igual e conta em 'passaram'", () => {
    const db = abrirBanco(":memory:");
    const texto = "linha 1\nlinha 2 com 'aspas', <b>html</b> e emoji 🚦";
    const p = inserirPrompt(db, novoPrompt({ texto }));
    expect(p.semaforo).toBe("verde");
    expect(lerFeed(db).prompts).toEqual([p]);
    expect(lerPlacar(db).passaram).toBe(1);
  });
```

E troque o teste `"com nota: grava os critérios e a cor segue a nota"` por:

```ts
  it("avaliado pelo Jev: grava cor, critérios, faltando e duração como vieram (a cor não sai da nota)", () => {
    const db = abrirBanco(":memory:");
    const criterios = { tamanho: "funcionalidade" as const, tamanhoPct: 50, objetivoPct: 90, ondePct: 30, prontoPct: 90, focoPct: 90 };
    const p = inserirPrompt(
      db,
      novoPrompt({ nota: 75, criterios, semaforo: "amarelo", avaliacao: "jev", duracaoMs: 1312, faltando: ["onde"] }),
    );
    expect(p.semaforo).toBe("amarelo");
    expect(lerFeed(db).prompts[0]).toEqual(p);
    expect(lerPlacar(db).perguntas).toBe(1);
  });

  it("Jev falhou: guarda o motivo", () => {
    const db = abrirBanco(":memory:");
    inserirPrompt(db, novoPrompt({ avaliacao: "falhou", motivo: "TypeSafe indisponível", duracaoMs: 8001 }));
    expect(lerFeed(db).prompts[0]).toMatchObject({ avaliacao: "falhou", motivo: "TypeSafe indisponível", faltando: null });
  });
```

No `describe("migração")`, acrescente:

```ts
  it("banco v2 com dados vira v3 sem perder nada; prompts antigos ficam sem avaliação", () => {
    const caminho = arquivoTemporario();
    const v2 = new Database(caminho);
    v2.exec(`
      CREATE TABLE prompts (
        id INTEGER PRIMARY KEY AUTOINCREMENT, texto TEXT NOT NULL, criado_em TEXT NOT NULL, origem TEXT NOT NULL, sessao TEXT,
        tamanho TEXT CHECK (tamanho IN ('ajuste', 'funcionalidade', 'sistema')),
        tamanho_pct INTEGER, objetivo_pct INTEGER, onde_pct INTEGER, pronto_pct INTEGER, foco_pct INTEGER, nota INTEGER,
        semaforo TEXT NOT NULL CHECK (semaforo IN ('verde', 'amarelo', 'vermelho')));
      CREATE TABLE comandos (
        id INTEGER PRIMARY KEY AUTOINCREMENT, criado_em TEXT NOT NULL, origem TEXT NOT NULL, sessao TEXT,
        tipo TEXT NOT NULL, alvo TEXT NOT NULL, regra TEXT, semaforo TEXT NOT NULL);
      INSERT INTO prompts (texto, criado_em, origem, sessao, semaforo) VALUES ('prompt da etapa 2', '2026-10-07T10:00:00.000Z', 'happy-team-chat', 's', 'verde');
      INSERT INTO comandos (criado_em, origem, sessao, tipo, alvo, semaforo) VALUES ('2026-10-07T10:00:01.000Z', 'happy-team-chat', 's', 'comando', 'ls', 'liberado');
      PRAGMA user_version = 2;`);
    v2.close();

    const db = abrirBanco(caminho);
    expect(db.pragma("user_version", { simple: true })).toBe(3);
    const feed = lerFeed(db);
    expect(feed.prompts).toHaveLength(1);
    expect(feed.prompts[0]).toMatchObject({ texto: "prompt da etapa 2", avaliacao: null, duracaoMs: null, faltando: null, motivo: null });
    expect(feed.comandos).toHaveLength(1);
    inserirPrompt(db, novoPrompt({ avaliacao: "jev", faltando: ["objetivo", "mistura"], semaforo: "amarelo" }));
    expect(lerFeed(db).prompts[0].faltando).toEqual(["objetivo", "mistura"]);
    db.close();
  });
```

Em `tests/ganchos.test.ts`, o primeiro teste deixa de esperar `criterios` e `nota`:

```ts
    expect(p).toEqual({
      texto: "corrige o login\nem src/auth",
      criadoEm: "2026-10-07T12:00:00.000Z",
      origem: "happy-team-chat",
      sessao: "sess-1",
    });
```

Em `tests/avaliacao.test.ts`, apague os blocos `describe("calcularNota", …)` e `describe("semaforoDoPrompt", …)` e o helper `criterios` (que só eles usam). Tire `calcularNota` e `semaforoDoPrompt` do import, além do `import type { Criterios }` se ficar sem uso. Os blocos de `semaforoDaNota`, `semaforoDoComando` e `limitarPct` ficam.

- [ ] **Step 2: Rodar e ver falhar**

Run: `corepack pnpm exec vitest run tests/db.test.ts tests/ganchos.test.ts tests/avaliacao.test.ts`
Expected: FAIL. O teste de migração para em `user_version` 2 ≠ 3 ou na coluna `avaliacao` ausente; o de ganchos falha porque `criterios`/`nota` ainda vêm no objeto; o "avaliado pelo Jev" falha porque o semáforo sai da nota (75 → verde, esperado amarelo).

- [ ] **Step 3: Implementar**

Em `src/lib/tipos.ts`, troque a interface `Prompt` e os tipos `NovoPrompt` por:

```ts
export interface Prompt {
  id: number;
  texto: string;
  criadoEm: string;
  /** Nome do projeto de onde veio (última pasta do cwd do Claude Code). */
  origem: string;
  sessao: string | null;
  /** Nulos quando o Jev não avaliou (pressa, resposta curta, falha ou etapa 2). */
  criterios: Criterios | null;
  nota: number | null;
  semaforo: Semaforo;
  /** Nulo = registrado na etapa 2, antes da avaliação com IA. */
  avaliacao: Avaliacao | null;
  duracaoMs: number | null;
  faltando: Criterio[] | null;
  /** Por que o Jev não avaliou. */
  motivo: string | null;
}
```

```ts
/** O que o gancho UserPromptSubmit traz, antes de qualquer avaliação. */
export type PacotePrompt = Pick<Prompt, "texto" | "criadoEm" | "origem" | "sessao">;
export type NovoPrompt = Omit<Prompt, "id">;
```

(`Avaliacao` e `Criterio` já estão no mesmo arquivo desde a Task 1.)

Em `src/lib/ganchos.ts`, troque `NovoPrompt` por `PacotePrompt` no import e na assinatura, e tire `criterios: null, nota: null` do objeto devolvido:

```ts
export function lerGanchoPrompt(corpo: unknown, agora = new Date()): PacotePrompt | null {
  if (!ehObjeto(corpo)) return null;
  const texto = textoCheio(corpo.prompt);
  const cwd = textoCheio(corpo.cwd);
  if (!texto || !cwd) return null;
  return { texto, criadoEm: agora.toISOString(), origem: origemDe(cwd), sessao: textoCheio(corpo.session_id) };
}
```

Em `src/lib/avaliacao.ts`, apague `calcularNota` e `semaforoDoPrompt`. O import de tipos fica `import type { Semaforo, SemaforoSaida } from "./tipos";`.

Em `src/lib/db.ts`:

1. Import: `import { semaforoDoComando } from "./avaliacao";`. Nos tipos, acrescente `Avaliacao` e `Criterio`.
2. `VERSAO_ESQUEMA` e o comentário:

```ts
/** v1 = etapa 1 (dados de mentira); v2 = dados reais vindos dos hooks; v3 = avaliação do Jev. */
export const VERSAO_ESQUEMA = 3;
```

3. No `ESQUEMA`, a tabela `prompts` ganha as 4 colunas depois de `semaforo`, com o mesmo texto do `ALTER` abaixo:

```sql
  semaforo     TEXT    NOT NULL CHECK (semaforo IN ('verde', 'amarelo', 'vermelho')),
  avaliacao    TEXT    CHECK (avaliacao IN ('jev', 'pressa', 'curta', 'falhou')),
  duracao_ms   INTEGER,
  faltando     TEXT,
  motivo       TEXT
);
```

4. Logo depois do `ESQUEMA`:

```ts
/** v2 → v3: as colunas da avaliação, sem tocar nos dados (nulas nos prompts antigos). */
const COLUNAS_V3 = `
ALTER TABLE prompts ADD COLUMN avaliacao  TEXT CHECK (avaliacao IN ('jev', 'pressa', 'curta', 'falhou'));
ALTER TABLE prompts ADD COLUMN duracao_ms INTEGER;
ALTER TABLE prompts ADD COLUMN faltando   TEXT;
ALTER TABLE prompts ADD COLUMN motivo     TEXT;
`;
```

5. `LinhaPrompt` ganha:

```ts
  avaliacao: Avaliacao | null;
  duracao_ms: number | null;
  /** Array JSON de Criterio. */
  faltando: string | null;
  motivo: string | null;
```

6. `paraPrompt` ganha, depois de `semaforo: l.semaforo,`:

```ts
  avaliacao: l.avaliacao,
  duracaoMs: l.duracao_ms,
  faltando: l.faltando === null ? null : (JSON.parse(l.faltando) as Criterio[]),
  motivo: l.motivo,
```

7. `inserirPrompt`:

```ts
export function inserirPrompt(db: Banco, p: NovoPrompt): Prompt {
  const c = p.criterios;
  const r = db
    .prepare(
      `INSERT INTO prompts (texto, criado_em, origem, sessao, tamanho, tamanho_pct, objetivo_pct, onde_pct, pronto_pct, foco_pct, nota, semaforo, avaliacao, duracao_ms, faltando, motivo)
       VALUES (@texto, @criadoEm, @origem, @sessao, @tamanho, @tamanhoPct, @objetivoPct, @ondePct, @prontoPct, @focoPct, @nota, @semaforo, @avaliacao, @duracaoMs, @faltando, @motivo)`,
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
      semaforo: p.semaforo,
      avaliacao: p.avaliacao,
      duracaoMs: p.duracaoMs,
      faltando: p.faltando === null ? null : JSON.stringify(p.faltando),
      motivo: p.motivo,
    });
  return { ...p, id: Number(r.lastInsertRowid) };
}
```

8. `migrar`: atualize o comentário e acrescente o passo v2→v3:

```ts
/**
 * Passos explícitos por versão. Só o passo da v1 apaga tabelas, porque a v1 tinha apenas
 * dados de mentira. Daqui em diante, todo passo preserva os dados (ALTER).
 */
function migrar(db: Banco) {
  const versao = db.pragma("user_version", { simple: true }) as number;
  if (versao > VERSAO_ESQUEMA) {
    throw new Error(`Banco na versão ${versao}, mais nova que a deste Crivo (${VERSAO_ESQUEMA}). Atualize o Crivo.`);
  }
  db.transaction(() => {
    if (versao < 2) db.exec("DROP TABLE IF EXISTS prompts; DROP TABLE IF EXISTS comandos;");
    if (versao === 2) db.exec(COLUNAS_V3);
    db.exec(ESQUEMA);
    db.pragma(`user_version = ${VERSAO_ESQUEMA}`);
  })();
}
```

(Banco novo, com `user_version` 0, cai no passo da v1, cujo `DROP IF EXISTS` não faz nada, e o `ESQUEMA` já cria as colunas da v3. Num banco v2, o `ALTER` acrescenta as colunas e o `CREATE … IF NOT EXISTS` não faz nada.)

- [ ] **Step 4: Rodar e ver passar**

Run: `corepack pnpm exec vitest run tests/db.test.ts tests/ganchos.test.ts tests/avaliacao.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `corepack pnpm typecheck`
Expected: erro **só** em `src/lib/respostas.ts`, porque `inserirPrompt` recebe um `PacotePrompt` sem `semaforo`, `avaliacao` etc. A Task 4 refaz essa função. Para este commit, ponha em `respostaGanchoPrompt` o mínimo que compila e mantém o comportamento da etapa 2:

```ts
    inserirPrompt(banco(), {
      ...novo,
      criterios: null,
      nota: null,
      semaforo: "verde",
      avaliacao: null,
      duracaoMs: null,
      faltando: null,
      motivo: null,
    });
```

Rode de novo `corepack pnpm typecheck && corepack pnpm test`.
Expected: sem erros de tipo; a suíte inteira passa.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tipos.ts src/lib/db.ts src/lib/ganchos.ts src/lib/avaliacao.ts src/lib/respostas.ts tests/db.test.ts tests/ganchos.test.ts tests/avaliacao.test.ts
git -c user.name="Junior Almeida" -c user.email="junioralmeidatecnologia@gmail.com" commit -m "Banco v3: avaliação, duração, faltando e motivo, migrando a v2 sem perder dados

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Rotas — o gancho decide e a área de teste avalia sem gravar

**Files:**
- Modify: `src/lib/respostas.ts`
- Create: `src/app/api/avaliar/route.ts`
- Test: `tests/api.test.ts`

**Interfaces:**
- Consumes:
  - `decidir(texto, avaliar): Promise<Decisao>` e `MENSAGEM_PRESSA` (Task 1);
  - `avaliarComJev` (Task 2);
  - `inserirPrompt(db, NovoPrompt)` e `lerGanchoPrompt(...): PacotePrompt | null` (Task 3);
  - `Avaliador` e `RespostaJev` (Task 1).
- Produces:
  - `respostaGanchoPrompt(req: Request, avaliar?: Avaliador): Promise<Response>`, que responde 200 com o `SaidaGancho`;
  - `respostaAvaliar(req: Request, avaliar?: Avaliador): Promise<Response>`, que responde 200 com a `Decisao` (JSON) ou 400 `{ erro }`;
  - a rota `POST /api/avaliar`.

Decisão registrada (não está na spec): se o banco falhar **depois** de o Jev decidir, a rota continua respondendo 500, como na etapa 2. O `curl -f` não imprime nada e o prompt segue, mesmo que a decisão fosse vermelha. Isso vem da regra da spec "Crivo com erro → o prompt segue": um gancho que bloqueia sem conseguir registrar seria invisível no painel.

- [ ] **Step 1: Escrever os testes que falham**

Em `tests/api.test.ts`:

1. Troque a linha de import dinâmico e acrescente os imports:

```ts
import { beforeAll, describe, expect, it, vi } from "vitest";
import { MENSAGEM_PRESSA } from "@/lib/decisao";
import type { Avaliador, Decisao, Feed, RespostaJev } from "@/lib/tipos";

process.env.CRIVO_DB = ":memory:";
const { respostaAvaliar, respostaFeed, respostaGanchoFerramenta, respostaGanchoPrompt } = await import("@/lib/respostas");
```

2. Depois de `const base = …`, os avaliadores falsos:

```ts
const jev = (extra: Partial<RespostaJev> = {}): Avaliador =>
  vi.fn(async () => ({
    ok: true as const,
    tamanho: "funcionalidade" as const,
    probTamanho: { ajuste: 0, funcionalidade: 1, sistema: 0 },
    objetivo: 0.9,
    onde: 0.9,
    pronto: 0.9,
    mistura: 0.1,
    duracaoMs: 1300,
    ...extra,
  }));
const naoChamar: Avaliador = async () => {
  throw new Error("o Jev não devia ter sido chamado");
};
const LONGO = "cria a tela de relatórios de atendimento por período";
const prompt = (texto: string) => post({ ...base, hook_event_name: "UserPromptSubmit", prompt: texto });
```

3. O teste existente `"prompt: responde {}, grava verde sem nota e acende o 'conectado'"` passa a usar `naoChamar` e confere a avaliação "curta":

```ts
  it("prompt curto: responde {}, grava verde 'curta' sem chamar o Jev e acende o 'conectado'", async () => {
    const r = await respostaGanchoPrompt(prompt("corrige o login"), naoChamar);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({});
    const f = await feed();
    expect(f.prompts[0]).toMatchObject({ texto: "corrige o login", nota: null, criterios: null, semaforo: "verde", sessao: "sess-1", avaliacao: "curta" });
    expect(f.placar.passaram).toBe(1);
    expect(f.conexao.conectado).toBe(true);
  });
```

4. Novo `describe`, no fim do arquivo:

```ts
describe("o Jev no portão de entrada", () => {
  it("verde: responde {} e grava nota, critérios e duração", async () => {
    const r = await respostaGanchoPrompt(prompt(LONGO), jev());
    expect(await r.json()).toEqual({});
    expect((await feed()).prompts[0]).toMatchObject({
      texto: LONGO,
      semaforo: "verde",
      avaliacao: "jev",
      nota: 90,
      faltando: [],
      duracaoMs: 1300,
      criterios: { tamanho: "funcionalidade", ondePct: 90 },
    });
  });

  it("amarelo: o Claude recebe o aviso em additionalContext", async () => {
    const r = await respostaGanchoPrompt(prompt(LONGO), jev({ onde: 0.2 }));
    const saida = await r.json();
    expect(saida.hookSpecificOutput.hookEventName).toBe("UserPromptSubmit");
    expect(saida.hookSpecificOutput.additionalContext).toMatch(/^Aviso do Crivo: neste pedido faltou em que tela/);
    expect((await feed()).prompts[0]).toMatchObject({ semaforo: "amarelo", faltando: ["onde"] });
  });

  it("vermelho: bloqueia com o motivo e conta em 'barrados'", async () => {
    const antes = (await feed()).placar.barrados;
    const r = await respostaGanchoPrompt(prompt(LONGO), jev({ objetivo: 0.1, onde: 0.1, pronto: 0.1 }));
    const saida = await r.json();
    expect(saida.decision).toBe("block");
    expect(saida.reason).toMatch(/^O Crivo barrou este prompt \(nota \d+\)\. Faltou: /);
    const f = await feed();
    expect(f.prompts[0].semaforo).toBe("vermelho");
    expect(f.placar.barrados).toBe(antes + 1);
  });

  it("pressa: passa sem o Jev e o Claude recebe a linha de ignorar a marca", async () => {
    const r = await respostaGanchoPrompt(prompt(">> faz o relatório do jeito que achar melhor"), naoChamar);
    expect((await r.json()).hookSpecificOutput.additionalContext).toBe(MENSAGEM_PRESSA);
    expect((await feed()).prompts[0]).toMatchObject({ avaliacao: "pressa", semaforo: "verde" });
  });

  it("Jev falhou: passa com {} e guarda o motivo", async () => {
    const r = await respostaGanchoPrompt(prompt(LONGO), async () => ({ ok: false, motivo: "sem chave TypeSafe", duracaoMs: 0 }));
    expect(await r.json()).toEqual({});
    expect((await feed()).prompts[0]).toMatchObject({ avaliacao: "falhou", motivo: "sem chave TypeSafe", semaforo: "verde" });
  });
});

describe("POST /api/avaliar (área de teste)", () => {
  const avaliar = (corpo: unknown, avaliador: Avaliador) =>
    respostaAvaliar(
      new Request("http://127.0.0.1:4000/api/avaliar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
      }),
      avaliador,
    );

  it("devolve a decisão inteira com a saída do gancho, sem gravar e sem mexer no sinal", async () => {
    const antes = await feed();
    const r = await avaliar({ texto: LONGO }, jev({ objetivo: 0.1, onde: 0.1, pronto: 0.1 }));
    expect(r.status).toBe(200);
    const d = (await r.json()) as Decisao;
    expect(d).toMatchObject({ semaforo: "vermelho", avaliacao: "jev", duracaoMs: 1300 });
    expect(d.saidaGancho.decision).toBe("block");
    const depois = await feed();
    expect(total(depois)).toBe(total(antes));
    expect(depois.placar).toEqual(antes.placar);
    expect(depois.conexao).toEqual(antes.conexao);
  });

  it("a pressa e a resposta curta também valem aqui", async () => {
    expect(((await (await avaliar({ texto: "sim" }, naoChamar)).json()) as Decisao).avaliacao).toBe("curta");
    expect(((await (await avaliar({ texto: ">> qualquer coisa longa aqui" }, naoChamar)).json()) as Decisao).avaliacao).toBe("pressa");
  });

  it.each([
    ["sem texto", {}],
    ["texto vazio", { texto: "   " }],
    ["texto que não é string", { texto: 5 }],
    ["JSON quebrado", "{quebrado"],
  ])("400 quando: %s", async (_, corpo) => {
    const r = await avaliar(corpo, naoChamar);
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ erro: "Escreva um prompt para avaliar." });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `corepack pnpm exec vitest run tests/api.test.ts`
Expected: FAIL. `respostaAvaliar` não existe (`is not a function`), e o gancho de prompt ainda grava `avaliacao: null` sem chamar o avaliador.

- [ ] **Step 3: Implementar em `src/lib/respostas.ts`**

Imports no topo:

```ts
import { lerConexao, registrarSinal } from "./conexao";
import { banco, inserirComando, inserirPrompt, lerFeed } from "./db";
import { decidir } from "./decisao";
import { lerGanchoFerramenta, lerGanchoPrompt } from "./ganchos";
import { avaliarComJev } from "./jev";
import type { Avaliador, Feed } from "./tipos";
```

Troque o comentário `// Resposta {} = "pode seguir". Nesta etapa o gancho descarta a resposta de qualquer jeito.` e a função `respostaGanchoPrompt` por:

```ts
// Resposta {} = "pode seguir". O gancho de prompt usa `curl -sf`: o corpo da resposta 200 vira a saída do hook.

/** Corpo do POST /api/ganchos/prompt (UserPromptSubmit). */
export async function respostaGanchoPrompt(req: Request, avaliar: Avaliador = avaliarComJev): Promise<Response> {
  const pacote = lerGanchoPrompt(await lerCorpo(req));
  if (!pacote) return recusar("pacote de prompt inválido");
  const d = await decidir(pacote.texto, avaliar);
  try {
    inserirPrompt(banco(), {
      ...pacote,
      criterios: d.criterios,
      nota: d.nota,
      semaforo: d.semaforo,
      avaliacao: d.avaliacao,
      duracaoMs: d.duracaoMs,
      faltando: d.faltando,
      motivo: d.motivo,
    });
    registrarSinal("prompt", pacote.criadoEm);
    return Response.json(d.saidaGancho);
  } catch (erro) {
    // Sem registro não há bloqueio: o 500 faz o curl -f calar e o prompt segue.
    console.error("[crivo] falha ao registrar o prompt", erro);
    return Response.json({ erro: "Não foi possível registrar o prompt." }, { status: 500 });
  }
}

/** Corpo do POST /api/avaliar: a área de teste. Não grava e não acende o "conectado". */
export async function respostaAvaliar(req: Request, avaliar: Avaliador = avaliarComJev): Promise<Response> {
  const corpo = await lerCorpo(req);
  const texto =
    typeof corpo === "object" && corpo !== null && "texto" in corpo && typeof corpo.texto === "string" && corpo.texto.trim()
      ? corpo.texto
      : null;
  if (!texto) return Response.json({ erro: "Escreva um prompt para avaliar." }, { status: 400 });
  return Response.json(await decidir(texto, avaliar));
}
```

Crie `src/app/api/avaliar/route.ts`:

```ts
import { respostaAvaliar } from "@/lib/respostas";

export function POST(request: Request) {
  return respostaAvaliar(request);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `corepack pnpm exec vitest run tests/api.test.ts`
Expected: PASS.

- [ ] **Step 5: Suíte inteira, typecheck e commit**

Run: `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test`
Expected: tudo passa.

```bash
git add src/lib/respostas.ts src/app/api/avaliar/route.ts tests/api.test.ts
git -c user.name="Junior Almeida" -c user.email="junioralmeidatecnologia@gmail.com" commit -m "O gancho de prompt decide com o Jev e a rota /api/avaliar testa sem gravar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Tela — nota, tempo do Jev, item aberto e área de teste

**Files:**
- Modify: `src/lib/hora.ts`, `tests/ambiente-hora.test.ts`
- Create: `src/components/DetalheAvaliacao.tsx`, `src/components/TestarPrompt.tsx`
- Modify: `src/components/ItemPrompt.tsx`, `src/components/Painel.tsx`

**Interfaces:**
- Consumes:
  - `mensagemAviso`, `mensagemBloqueio` e `ROTULO_FALTA` de `@/lib/decisao` (puros, então podem ir para o cliente);
  - os tipos `Decisao` e `Prompt`;
  - `POST /api/avaliar` (Task 4).
- Produces:
  - `formatarDuracao(ms: number): string`;
  - `<DetalheAvaliacao dados={…} />`;
  - `<TestarPrompt />`;
  - a prop opcional `acao?: ReactNode` em `Cabecalho`.

Antes de mexer na tela, carregue a skill `frontend-design` (obrigatória neste projeto) e siga o visual que já existe: sala de controle, monoespaçada, as cores do tema.

- [ ] **Step 1: Teste que falha para `formatarDuracao`**

Em `tests/ambiente-hora.test.ts`, troque o import de hora para `import { formatarDuracao, formatarHora } from "@/lib/hora";` e acrescente:

```ts
describe("formatarDuracao", () => {
  it("segundos com vírgula e uma casa", () => {
    expect(formatarDuracao(1312)).toBe("1,3 s");
    expect(formatarDuracao(8000)).toBe("8,0 s");
    expect(formatarDuracao(240)).toBe("0,2 s");
  });
});
```

Run: `corepack pnpm exec vitest run tests/ambiente-hora.test.ts`
Expected: FAIL (`formatarDuracao is not a function`).

- [ ] **Step 2: Implementar `formatarDuracao` em `src/lib/hora.ts`**

```ts
/** 1312 → "1,3 s". */
export function formatarDuracao(ms: number): string {
  return `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
}
```

Run: `corepack pnpm exec vitest run tests/ambiente-hora.test.ts`
Expected: PASS.

- [ ] **Step 3: Criar `src/components/DetalheAvaliacao.tsx`**

```tsx
import { ROTULO_FALTA, mensagemAviso, mensagemBloqueio } from "@/lib/decisao";
import type { Prompt, Tamanho } from "@/lib/tipos";
import { BarraCriterio } from "./BarraCriterio";
import { COR_ENTRADA } from "./Semaforo";

const ROTULO_TAMANHO: Record<Tamanho, string> = {
  ajuste: "ajuste pequeno",
  funcionalidade: "funcionalidade",
  sistema: "sistema inteiro",
};

export type DadosAvaliacao = Pick<Prompt, "semaforo" | "nota" | "criterios" | "faltando" | "avaliacao" | "motivo">;

function Citacao({ titulo, texto, cor }: { titulo: string; texto: string; cor: string }) {
  return (
    <figure>
      <figcaption className="text-xs uppercase tracking-wider text-apagado">{titulo}</figcaption>
      <blockquote
        className="mt-1 whitespace-pre-wrap border-l-2 pl-3 font-mono text-sm leading-relaxed [overflow-wrap:anywhere]"
        style={{ borderColor: cor }}
      >
        {texto}
      </blockquote>
    </figure>
  );
}

/** O corpo do item aberto: o mesmo na coluna e na área de teste. */
export function DetalheAvaliacao({ dados }: { dados: DadosAvaliacao }) {
  const { avaliacao, criterios: c } = dados;
  if (avaliacao === "pressa") {
    return (
      <p className="text-sm text-apagado">
        Passou direto (pressa, <code className="font-mono text-texto">&gt;&gt;</code>).
      </p>
    );
  }
  if (avaliacao === "curta") return <p className="text-sm text-apagado">Resposta curta: passou sem avaliação.</p>;
  if (avaliacao === "falhou") {
    return (
      <p className="text-sm" style={{ color: "var(--color-ambar)" }}>
        Não avaliado: {dados.motivo}.
      </p>
    );
  }
  if (avaliacao === null || c === null) return <p className="text-sm text-apagado">Registrado antes da avaliação com IA.</p>;

  const cor = COR_ENTRADA[dados.semaforo];
  const faltando = dados.faltando ?? [];
  return (
    <>
      {faltando.length > 0 ? (
        <p className="text-sm" style={{ color: cor }}>
          Faltou: {faltando.map((f) => ROTULO_FALTA[f]).join("; ")}.
        </p>
      ) : null}
      {dados.semaforo === "amarelo" ? <Citacao titulo="O Claude recebeu" texto={mensagemAviso(faltando)} cor={cor} /> : null}
      {dados.semaforo === "vermelho" && dados.nota !== null ? (
        <Citacao titulo="Barrado. No terminal" texto={mensagemBloqueio(dados.nota, faltando)} cor={cor} />
      ) : null}
      <BarraCriterio rotulo="Tamanho do pedido" pct={c.tamanhoPct} detalhe={ROTULO_TAMANHO[c.tamanho]} escala alerta={c.tamanho === "sistema"} />
      <BarraCriterio rotulo="Objetivo claro" pct={c.objetivoPct} />
      <BarraCriterio rotulo="Diz onde mexer" pct={c.ondePct} />
      <BarraCriterio rotulo="Diz quando está pronto" pct={c.prontoPct} />
      <BarraCriterio rotulo="Foco num assunto só" pct={c.focoPct} />
    </>
  );
}
```

- [ ] **Step 4: Atualizar `src/components/ItemPrompt.tsx`**

- Tire `ROTULO_TAMANHO`, `AVISO`, o import de `BarraCriterio` e o de `Tamanho`. Importe `DetalheAvaliacao` e `formatarDuracao`.
- `const semNota = prompt.avaliacao !== "jev" || prompt.nota === null;` (tira `const c = prompt.criterios;`).
- Na linha de rótulo e hora, depois do `<time>`:

```tsx
            {prompt.duracaoMs ? (
              <span className="text-apagado tabular-nums">Jev {formatarDuracao(prompt.duracaoMs)}</span>
            ) : null}
```

- O conteúdo do `<div id={idDetalhe} …>` passa a ser só `<DetalheAvaliacao dados={prompt} />`.

- [ ] **Step 5: Criar `src/components/TestarPrompt.tsx`**

```tsx
"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { formatarDuracao } from "@/lib/hora";
import type { Decisao } from "@/lib/tipos";
import { DetalheAvaliacao } from "./DetalheAvaliacao";
import { COR_ENTRADA, ROTULO_ENTRADA, SemaforoEntrada } from "./Semaforo";

type Estado = { tipo: "parado" } | { tipo: "avaliando" } | { tipo: "pronto"; d: Decisao } | { tipo: "erro" };

function NoClaudeCode({ d }: { d: Decisao }) {
  const s = d.saidaGancho;
  const [frase, texto] =
    s.decision === "block"
      ? ["seria barrado com esta mensagem:", s.reason ?? ""]
      : s.hookSpecificOutput
        ? ["passaria com este aviso ao Claude:", s.hookSpecificOutput.additionalContext]
        : ["passaria em silêncio.", null];
  return (
    <section className="rounded-md border border-borda bg-black/25 p-3">
      <h3 className="text-sm font-semibold">No Claude Code, isto {frase}</h3>
      {texto ? (
        <p className="mt-2 whitespace-pre-wrap font-mono text-sm leading-relaxed text-apagado [overflow-wrap:anywhere]">{texto}</p>
      ) : null}
    </section>
  );
}

function Resultado({ d }: { d: Decisao }) {
  const cor = COR_ENTRADA[d.semaforo];
  const temNota = d.avaliacao === "jev" && d.nota !== null;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <SemaforoEntrada semaforo={d.semaforo} />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-medium" style={{ color: cor }}>
            {ROTULO_ENTRADA[d.semaforo]}
          </p>
          {d.duracaoMs ? <p className="text-apagado tabular-nums">Jev {formatarDuracao(d.duracaoMs)}</p> : null}
        </div>
        <span className="flex flex-col items-end">
          <span
            className="font-mono text-3xl font-semibold leading-none tabular-nums"
            style={temNota ? { color: cor, textShadow: `0 0 16px color-mix(in oklab, ${cor} 55%, transparent)` } : { color: "var(--color-apagado)" }}
          >
            {temNota ? d.nota : "—"}
          </span>
          <span className="mt-1 text-xs text-apagado">nota</span>
        </span>
      </div>
      <div className="space-y-3">
        <DetalheAvaliacao dados={d} />
      </div>
      <NoClaudeCode d={d} />
    </div>
  );
}

/** Botão "Testar um prompt" e o painel por cima da tela. Não grava nada. */
export function TestarPrompt() {
  const dialogo = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  const [texto, setTexto] = useState("");
  const [estado, setEstado] = useState<Estado>({ tipo: "parado" });
  const avaliando = estado.tipo === "avaliando";

  async function avaliar(e: FormEvent) {
    e.preventDefault();
    if (avaliando || !texto.trim()) return;
    setEstado({ tipo: "avaliando" });
    try {
      const r = await fetch("/api/avaliar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setEstado({ tipo: "pronto", d: (await r.json()) as Decisao });
    } catch {
      setEstado({ tipo: "erro" });
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialogo.current?.showModal()}
        className="min-h-9 rounded-md border border-info/50 px-3 text-sm font-medium text-info transition-colors hover:bg-info/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info"
      >
        Testar um prompt
      </button>
      <dialog
        ref={dialogo}
        aria-labelledby={idTitulo}
        className="m-auto max-h-[90dvh] w-[min(100%-2rem,48rem)] overflow-y-auto rounded-lg border border-borda bg-painel p-0 text-texto backdrop:bg-black/75"
      >
        <form onSubmit={avaliar} className="space-y-4 p-4 md:p-5">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 id={idTitulo} className="text-lg font-semibold">
                Testar um prompt
              </h2>
              <p className="text-sm text-apagado">Avalia como o portão de entrada, sem mandar ao Claude Code e sem gravar.</p>
            </div>
            <button
              type="button"
              onClick={() => dialogo.current?.close()}
              className="min-h-9 rounded-md border border-borda px-3 text-sm text-apagado hover:text-texto focus-visible:outline-2 focus-visible:outline-info"
            >
              Fechar
            </button>
          </div>
          <label className="block">
            <span className="sr-only">Prompt</span>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={6}
              placeholder="Cole aqui o prompt que você mandaria ao Claude Code"
              className="block w-full resize-y rounded-md border border-borda bg-black/40 p-3 font-mono text-sm leading-relaxed placeholder:text-apagado focus-visible:outline-2 focus-visible:outline-info"
            />
          </label>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              aria-disabled={avaliando || !texto.trim()}
              className="min-h-10 rounded-md bg-info px-4 text-sm font-semibold text-fundo aria-disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info"
            >
              {avaliando ? "Avaliando…" : "Avaliar"}
            </button>
            <p role="status" className="text-sm text-apagado">
              {estado.tipo === "erro" ? <span style={{ color: "var(--color-ambar)" }}>Não deu para avaliar agora. O Crivo está ligado?</span> : null}
            </p>
          </div>
          {estado.tipo === "pronto" ? <Resultado d={estado.d} /> : null}
        </form>
      </dialog>
    </>
  );
}
```

O `<dialog>` com `showModal()` já fecha com Esc e devolve o foco ao botão que o abriu. Não reimplemente isso.

- [ ] **Step 6: Pôr o botão no cabeçalho, em `src/components/Painel.tsx`**

- Acrescente `import type { ReactNode } from "react";` (junto do import de `react`, como `type ReactNode`) e `import { TestarPrompt } from "./TestarPrompt";`.
- `Cabecalho` ganha `acao?: ReactNode` nas props (`{ sinal, conexao, acao }` e no tipo `acao?: ReactNode;`). Dentro da `div` da direita (`ml-auto flex flex-col items-end gap-1.5`), como primeiro filho: `{acao}`.
- No `Painel`: `<Cabecalho sinal={sinal} conexao={feed.conexao} acao={<TestarPrompt />} />`.

- [ ] **Step 7: Verificação estática**

Run: `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test && corepack pnpm build`
Expected: tudo passa. Se o build reclamar de tipos velhos em `.next/types`, rode `corepack pnpm exec next typegen` e repita.

- [ ] **Step 8: Conferir no navegador (sem gastar o Jev)**

1. Confira se a porta 4000 está livre: `ss -ltnp | grep ':4000'`. Se estiver ocupada, peça ao usuário para desligar o Crivo dele.
2. Suba o Crivo com um banco temporário e sem chave, para a área de teste não chamar a TypeSafe:
   `CRIVO_DB=/tmp/claude-1000/crivo-tela.db TYPESAFE_API_KEY= corepack pnpm dev`, em segundo plano.
3. Ponha dados de teste pelo gancho, com `curl`, um por tipo: `"sim"` (curta), `">> faz o que achar melhor aqui"` (pressa) e `"cria a tela de relatórios de atendimento por período"` (falhou, sem chave):
   `curl -s -H 'Content-Type: application/json' --data-binary '{"session_id":"t","cwd":"/home/junior/Projects/happy-team-chat","prompt":"sim"}' http://127.0.0.1:4000/api/ganchos/prompt`
4. No Playwright, em `http://127.0.0.1:4000`, confira:
   - os 3 itens aparecem com "—" na nota;
   - aberto, cada item mostra o texto do seu tipo ("Resposta curta: passou sem avaliação", "Passou direto (pressa, >>)", "Não avaliado: sem chave TypeSafe.");
   - "Testar um prompt" abre o painel; "sim" → "Avaliar" mostra "Passou", "—" e "No Claude Code, isto passaria em silêncio.";
   - `>> x y z w` mostra "passaria com este aviso ao Claude:" com a linha da pressa;
   - Esc fecha e o foco volta ao botão;
   - a 375 px de largura, o cabeçalho e o painel não criam rolagem horizontal;
   - o console não tem erros.
5. Para ver um prompt da etapa 2 (`avaliacao` nula) e as barras de um prompt avaliado sem gastar o Jev, grave direto no banco temporário com `sqlite3` ou um script `node` com better-sqlite3: um prompt com `avaliacao` NULL e outro `jev`/`vermelho` com critérios e `faltando` `["objetivo","onde","pronto"]`. Confira "Registrado antes da avaliação com IA" no primeiro e, no segundo, "Faltou: …", "Barrado. No terminal" e as 5 barras.
6. Pare o servidor, apague `/tmp/claude-1000/crivo-tela.db*` e `/home/junior/Projects/happy-team-chat/.playwright-mcp`.

- [ ] **Step 9: Commit**

```bash
git add src/lib/hora.ts tests/ambiente-hora.test.ts src/components/DetalheAvaliacao.tsx src/components/TestarPrompt.tsx src/components/ItemPrompt.tsx src/components/Painel.tsx
git -c user.name="Junior Almeida" -c user.email="junioralmeidatecnologia@gmail.com" commit -m "Tela da etapa 3: nota do Jev, tempo, o que o Claude recebeu e a área de teste

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Ligar o gancho e conferir de verdade

**Files:**
- Modify (sem commit, arquivo ignorado): `/home/junior/Projects/happy-team-chat/.claude/settings.local.json`

**Interfaces:**
- Consumes: `POST /api/ganchos/prompt` (Task 4), que responde 200 com o `SaidaGancho` em JSON.

Atenção: assim que este arquivo mudar e o Crivo estiver ligado, **os prompts desta própria sessão** (cwd happy-team-chat) passam a ser avaliados. Respostas de até 4 palavras passam, e `>>` pula a avaliação.

- [ ] **Step 1: Trocar só o comando do gancho de prompt**

Em `settings.local.json`, o bloco `UserPromptSubmit` fica:

```json
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "curl -sf -m 10 -H 'Content-Type: application/json' --data-binary @- http://127.0.0.1:4000/api/ganchos/prompt || true",
            "timeout": 15
          }
        ]
      }
    ],
```

O bloco `PreToolUse` não muda. Confira se o arquivo continua JSON válido: `node -e 'JSON.parse(require("fs").readFileSync("/home/junior/Projects/happy-team-chat/.claude/settings.local.json","utf8"))' && echo ok`.
Expected: `ok`.

- [ ] **Step 2: Crivo desligado → o gancho não imprime nada e sai com 0**

Com a porta 4000 livre:

```bash
time (echo '{"session_id":"t","cwd":"/home/junior/Projects/happy-team-chat","prompt":"faz uns relatórios aí e muda o login também"}' | curl -sf -m 10 -H 'Content-Type: application/json' --data-binary @- http://127.0.0.1:4000/api/ganchos/prompt || true; echo "saida=$?")
```

Expected: nenhuma saída antes de `saida=0`, e o tempo bem abaixo de 1 s.

- [ ] **Step 3: Rodada com o Jev real (5 prompts, área de teste)**

Suba o Crivo com a chave real (`.env.local`, **sem imprimir o arquivo**) e um banco temporário: `CRIVO_DB=/tmp/claude-1000/crivo-real.db corepack pnpm dev`, em segundo plano. Para cada prompt abaixo, chame `/api/avaliar` e anote semáforo, nota, faltando e `duracaoMs`:

```bash
avaliar() { curl -s -m 15 -H 'Content-Type: application/json' --data-binary "$(node -e 'console.log(JSON.stringify({texto:process.argv[1]}))' "$1")" http://127.0.0.1:4000/api/avaliar | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const d=JSON.parse(s);console.log(d.semaforo,d.nota,d.avaliacao,JSON.stringify(d.faltando),d.duracaoMs,d.motivo??"")})'; }
avaliar "faz uns relatórios aí e muda o login também"
avaliar "Na tela de Atendimento (src/app/atendimento), crie um relatório de conversas por atendente com filtro de período. Pronto quando a tabela mostrar total de conversas e tempo médio de resposta por atendente e o teste de relatório passar."
avaliar "cria um relatório de conversas por atendente com filtro de período"
avaliar "troca o texto do botão Enviar para Mandar na tela de conversa"
avaliar "arruma o bug da lista de contatos, troca a cor do tema e cria a página de planos"
```

Expected (orientação, não critério de aceite rígido):
- o 1º vermelho;
- o 2º verde;
- o 3º amarelo ou vermelho;
- o 4º verde (ajuste);
- o 5º com `mistura` em `faltando`;
- `avaliacao` "jev" em todos;
- `duracaoMs` bem abaixo de 8000.

Se `avaliacao` vier "falhou", leia o `motivo` e o console do Crivo antes de qualquer outra coisa. Se o Jev discordar da expectativa, **não mexa nos limites**: registre os números para o usuário calibrar.

- [ ] **Step 4: O comando exato do gancho com o Crivo ligado**

```bash
time (echo '{"session_id":"t","cwd":"/home/junior/Projects/happy-team-chat","prompt":"faz uns relatórios aí e muda o login também"}' | curl -sf -m 10 -H 'Content-Type: application/json' --data-binary @- http://127.0.0.1:4000/api/ganchos/prompt || true; echo; echo "saida=$?")
```

Expected: um JSON `{"decision":"block","reason":"O Crivo barrou este prompt (nota …). Faltou: …"}` e depois `saida=0`, em menos de 10 s. Repita com um prompt `">> faz uns relatórios aí"`: deve sair o `hookSpecificOutput` da pressa, quase na hora.

- [ ] **Step 5: A área de teste com o Jev real, no navegador**

No Playwright, abra "Testar um prompt" e avalie o prompt 2 da lista. Confira o verde, a nota, "Jev x,x s" e "passaria em silêncio". Depois avalie o 3º e confira o aviso citado. Feche, pare o servidor e apague `/tmp/claude-1000/crivo-real.db*` e `/home/junior/Projects/happy-team-chat/.playwright-mcp`.

- [ ] **Step 6: Registrar**

Nada para commitar no happy-team-chat (o arquivo é ignorado: confira com `git -C /home/junior/Projects/happy-team-chat status --short`, que não deve listar o `settings.local.json`). Os resultados dos 5 prompts reais vão para a mensagem final ao usuário.

---

## Depois das tarefas

- Revisão final do branch inteiro por um revisor novo (Opus 5.5), com o Review Focus acima.
- superpowers:finishing-a-development-branch: o fluxo da casa é testar na `developer` e só mesclar na `main` com aprovação do usuário. Sem PR, sem push.
- Avisar o usuário: ligar o Crivo (`corepack pnpm dev` no crivo) e mandar prompts no Claude Code do happy-team-chat. O banco real migra de v1/v2 para v3 no primeiro start.
