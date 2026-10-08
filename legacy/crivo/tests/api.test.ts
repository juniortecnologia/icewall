import { beforeAll, describe, expect, it, vi } from "vitest";
import { MENSAGEM_PRESSA } from "@/lib/decisao";
import type { Avaliador, Decisao, Feed, RespostaJev } from "@/lib/tipos";

process.env.CRIVO_DB = ":memory:";
const { respostaAvaliar, respostaFeed, respostaGanchoFerramenta, respostaGanchoPrompt } = await import("@/lib/respostas");

const post = (corpo: unknown) =>
  new Request("http://127.0.0.1:4000/api/ganchos/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });
const feed = async () => (await respostaFeed().json()) as Feed;
const total = (f: Feed) => f.prompts.length + f.comandos.length;
const base = { session_id: "sess-1", cwd: "/home/junior/Projects/happy-team-chat" };
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

  it("prompt curto: responde {}, grava verde 'curta' sem chamar o Jev e acende o 'conectado'", async () => {
    const r = await respostaGanchoPrompt(prompt("corrige o login"), naoChamar);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({});
    const f = await feed();
    expect(f.prompts[0]).toMatchObject({ texto: "corrige o login", nota: null, criterios: null, semaforo: "verde", sessao: "sess-1", avaliacao: "curta" });
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

describe("resposta que chega depois de o gancho desistir", () => {
  it("passou do limite: grava 'falhou' com o motivo, não o vermelho que o Claude nunca viu", async () => {
    const antes = (await feed()).placar.barrados;
    const lento: Avaliador = async () => {
      await new Promise((r) => setTimeout(r, 30));
      return { ok: true, tamanho: "funcionalidade", probTamanho: { ajuste: 0, funcionalidade: 1, sistema: 0 }, objetivo: 0.1, onde: 0.1, pronto: 0.1, mistura: 0.1, duracaoMs: 30 };
    };
    const r = await respostaGanchoPrompt(prompt(LONGO), lento, 10);
    expect(await r.json()).toEqual({});
    const f = await feed();
    expect(f.prompts[0]).toMatchObject({ avaliacao: "falhou", semaforo: "verde", nota: null, motivo: "o Crivo demorou mais que o gancho espera e o prompt passou" });
    expect(f.placar.barrados).toBe(antes);
  });
});
