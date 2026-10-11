import { beforeEach, describe, expect, it } from "vitest";
import { getDb, schema } from "@/server/db/client";
import { claudePerguntou, custoJev, inserirComando, inserirPrompt, lerFeed, lerPlacar, ultimoSinal } from "@/server/crivo/store";
import type { NovoComando, NovoPrompt } from "@/server/crivo/tipos";

// O setup do Vitest aponta o ICEWALL_DB para um banco em memória, já migrado.

const T0 = Date.parse("2026-10-07T12:00:00.000Z");

const novoPrompt = (extra: Partial<NovoPrompt> = {}): NovoPrompt => ({
  texto: "corrige o login",
  ts: T0,
  origem: "happy-team-chat",
  sessao: "sess-1",
  criterios: null,
  nota: null,
  semaforo: "verde",
  avaliacao: "curta",
  duracaoMs: null,
  faltando: null,
  motivo: null,
  tokens: null,
  ...extra,
});

const novoComando = (extra: Partial<NovoComando> = {}): NovoComando => ({
  tipo: "comando",
  alvo: "pnpm test",
  regra: null,
  ts: T0 + 1000,
  origem: "happy-team-chat",
  sessao: "sess-1",
  ...extra,
});

beforeEach(() => {
  getDb().delete(schema.crivoPrompts).run();
  getDb().delete(schema.crivoComandos).run();
});

describe("banco vazio", () => {
  it("feed, placar e último sinal vazios", () => {
    expect(lerFeed()).toEqual({ prompts: [], comandos: [], placar: { passaram: 0, perguntas: 0, barrados: 0, segurados: 0 } });
    expect(ultimoSinal()).toBeNull();
  });
});

describe("prompts", () => {
  it("sem avaliação da Jev: grava, lê igual e conta em 'passaram'", () => {
    const texto = "linha 1\nlinha 2 com 'aspas', <b>html</b> e emoji 🚦";
    const p = inserirPrompt(novoPrompt({ texto }));
    expect(p).toMatchObject({ texto, criterios: null, tokens: null, semaforo: "verde" });
    expect(lerFeed().prompts).toEqual([p]);
    expect(lerPlacar().passaram).toBe(1);
  });

  it("avaliado pela Jev: critérios, faltando e tokens voltam iguais", () => {
    const criterios = { tamanho: "funcionalidade" as const, tamanhoPct: 50, objetivoPct: 30, ondePct: 80, prontoPct: 20, focoPct: 90 };
    const p = inserirPrompt(
      novoPrompt({
        criterios,
        nota: 55,
        semaforo: "amarelo",
        avaliacao: "jev",
        duracaoMs: 300,
        faltando: ["objetivo", "pronto"],
        tokens: { entrada: 900, saida: 12 },
      }),
    );
    expect(lerFeed().prompts[0]).toEqual(p);
    expect(p).toMatchObject({ criterios, faltando: ["objetivo", "pronto"], tokens: { entrada: 900, saida: 12 } });
  });

  it("placar conta cada cor", () => {
    inserirPrompt(novoPrompt());
    inserirPrompt(novoPrompt({ semaforo: "amarelo", avaliacao: "jev" }));
    inserirPrompt(novoPrompt({ semaforo: "vermelho", avaliacao: "jev" }));
    inserirPrompt(novoPrompt({ semaforo: "vermelho", avaliacao: "jev" }));
    expect(lerPlacar()).toEqual({ passaram: 1, perguntas: 1, barrados: 2, segurados: 0 });
  });
});

describe("comandos", () => {
  it("o semáforo sai da regra: sem regra liberado, com regra segurado", () => {
    expect(inserirComando(novoComando()).semaforo).toBe("liberado");
    expect(inserirComando(novoComando({ regra: "nunca git push --force" })).semaforo).toBe("segurado");
    expect(lerPlacar().segurados).toBe(1);
  });
});

describe("feed", () => {
  it("mais novos primeiro e com limite", () => {
    for (let i = 0; i < 5; i++) inserirPrompt(novoPrompt({ texto: `p${i}`, ts: T0 + i }));
    expect(lerFeed(3).prompts.map((p) => p.texto)).toEqual(["p4", "p3", "p2"]);
  });

  it("último sinal é o gancho mais recente de qualquer portão", () => {
    inserirPrompt(novoPrompt({ ts: T0 }));
    expect(ultimoSinal()).toBe(T0);
    inserirComando(novoComando({ ts: T0 + 5000 }));
    expect(ultimoSinal()).toBe(T0 + 5000);
  });
});

describe("claudePerguntou", () => {
  it("só quando o último prompt da sessão foi amarelo da Jev", () => {
    expect(claudePerguntou("sess-1")).toBe(false);
    inserirPrompt(novoPrompt({ semaforo: "amarelo", avaliacao: "jev" }));
    expect(claudePerguntou("sess-1")).toBe(true);
    expect(claudePerguntou("outra")).toBe(false);
    inserirPrompt(novoPrompt({ semaforo: "verde", avaliacao: "resposta" }));
    expect(claudePerguntou("sess-1")).toBe(false);
  });
});

describe("custoJev", () => {
  it("soma só os prompts que a Jev avaliou e cobrou", () => {
    inserirPrompt(novoPrompt({ avaliacao: "jev", tokens: { entrada: 900, saida: 12 } }));
    inserirPrompt(novoPrompt({ avaliacao: "jev", tokens: { entrada: 100, saida: 8 } }));
    inserirPrompt(novoPrompt({ avaliacao: "curta" }));
    expect(custoJev()).toEqual({ n: 2, entrada: 1000, saida: 20 });
  });
});
