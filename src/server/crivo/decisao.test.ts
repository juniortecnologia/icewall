import { describe, expect, it, vi } from "vitest";
import {
  MENSAGEM_PRESSA,
  decidir,
  decidirComJev,
  juntarComE,
  mensagemAviso,
  mensagemBloqueio,
  triagem,
} from "@/server/crivo/decisao";
import type { Criterio, RespostaJev, Tamanho } from "@/server/crivo/tipos";

const resposta = (extra: Partial<RespostaJev> = {}): RespostaJev => ({
  ok: true,
  tamanho: "funcionalidade",
  probTamanho: { ajuste: 0, funcionalidade: 1, sistema: 0 },
  objetivo: 0.9,
  onde: 0.9,
  pronto: 0.9,
  mistura: 0.1,
  duracaoMs: 1234,
  tokens: { entrada: 900, saida: 12 },
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
    ["<task-notification>\n<task-id>b65</task-id>\n<status>completed</status>\n</task-notification>", "notificacao"],
    ['<agent-message from="ace25">\n[Subagent hand-back] The text below is the final report', "notificacao"],
    ['<pasted_content id="53a7">\nAgora o Jev entra no portão de entrada e avalia tudo\n</pasted_content>', null],
    ["olha esse <task-notification> que chegou ontem no terminal", null],
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

  it("notificação do Claude Code: verde, sem chamar o Jev, saída vazia, mesmo respondendo ao Claude", async () => {
    const avaliar = vi.fn();
    const d = await decidir("<task-notification>\n<status>completed</status>\n</task-notification>", avaliar, { respondendo: true });
    expect(avaliar).not.toHaveBeenCalled();
    expect(d).toMatchObject({ semaforo: "verde", avaliacao: "notificacao", saidaGancho: {} });
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
      tokens: null,
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

describe("custo da Jev", () => {
  it("a decisão leva os tokens que a Jev cobrou; sem a Jev, nenhum", async () => {
    expect(decidirComJev(resposta()).tokens).toEqual({ entrada: 900, saida: 12 });
    expect((await decidir(">> rápido", vi.fn())).tokens).toBeNull();
  });
});

describe("resposta às perguntas do Claude", () => {
  const longo = "na tela de login, pronto quando o botão aparecer";

  it("respondendo: passa verde como 'resposta', sem chamar o Jev, em silêncio", async () => {
    const avaliar = vi.fn();
    const d = await decidir(longo, avaliar, { respondendo: true });
    expect(avaliar).not.toHaveBeenCalled();
    expect(d).toEqual({
      semaforo: "verde",
      nota: null,
      criterios: null,
      faltando: null,
      avaliacao: "resposta",
      motivo: null,
      duracaoMs: null,
      tokens: null,
      saidaGancho: {},
    });
  });

  it("a marca de pressa e a resposta curta continuam valendo antes", async () => {
    expect((await decidir(">> " + longo, vi.fn(), { respondendo: true })).avaliacao).toBe("pressa");
    expect((await decidir("sim", vi.fn(), { respondendo: true })).avaliacao).toBe("curta");
  });

  it("sem estar respondendo, o pedido longo vai ao Jev", async () => {
    const avaliar = vi.fn().mockResolvedValue(resposta());
    expect((await decidir(longo, avaliar, { respondendo: false })).avaliacao).toBe("jev");
    expect(avaliar).toHaveBeenCalledOnce();
  });
});
