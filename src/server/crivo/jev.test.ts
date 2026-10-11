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
