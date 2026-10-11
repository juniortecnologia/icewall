import { describe, expect, it, vi } from "vitest";
import { MENSAGEM_PRESSA } from "@/server/crivo/decisao";
import { montarFeed, respostaAvaliar, respostaGanchoFerramenta, respostaGanchoPrompt } from "@/server/crivo/respostas";
import type { Avaliador, Decisao, Feed, RespostaJev } from "@/server/crivo/tipos";

// O setup do Vitest dá a este arquivo um banco em memória. Os testes compartilham esse banco e rodam em ordem.

const post = (corpo: unknown) =>
  new Request("http://127.0.0.1:4310/api/crivo/hooks/x", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-icewall": "1" },
    body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });
const feed = async (): Promise<Feed> => montarFeed();
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
    tokens: { entrada: 900, saida: 12 },
    ...extra,
  }));
const naoChamar: Avaliador = async () => {
  throw new Error("o Jev não devia ter sido chamado");
};
/** O handler recebe uma fábrica por origem; aqui todas as origens usam o mesmo avaliador. */
const gancho = (req: Request, avaliar?: Avaliador, limiteMs?: number) =>
  respostaGanchoPrompt(req, avaliar ? () => avaliar : undefined, limiteMs);
const LONGO = "cria a tela de relatórios de atendimento por período";
const prompt = (texto: string) => post({ ...base, hook_event_name: "UserPromptSubmit", prompt: texto });

describe("portas dos ganchos", () => {
  it("o feed começa vazio e sem sinal", async () => {
    const f = await feed();
    expect(total(f)).toBe(0);
    expect(f.ultimoSinal).toBeNull();
  });

  it("ferramenta: responde {}, grava e atualiza o último sinal", async () => {
    const r = await respostaGanchoFerramenta(post({ ...base, tool_name: "Bash", tool_input: { command: "pnpm test" } }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({});
    const f = await feed();
    expect(f.comandos[0]).toMatchObject({ tipo: "comando", alvo: "pnpm test", semaforo: "liberado", origem: "happy-team-chat" });
    expect(f.ultimoSinal).toBe(f.comandos[0].ts);
  });

  it("prompt curto: responde {} e grava verde 'curta' sem chamar o Jev", async () => {
    const r = await gancho(prompt("corrige o login"), naoChamar);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({});
    const f = await feed();
    expect(f.prompts[0]).toMatchObject({ texto: "corrige o login", nota: null, criterios: null, semaforo: "verde", sessao: "sess-1", avaliacao: "curta" });
    expect(f.placar.passaram).toBe(1);
    expect(f.ultimoSinal).toBe(f.prompts[0].ts);
  });

  it("JSON quebrado e pacote incompleto: 400 sem gravar nada", async () => {
    const antes = total(await feed());
    expect((await gancho(post("{quebrado"))).status).toBe(400);
    expect((await gancho(post({ ...base }))).status).toBe(400);
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
    const r = await gancho(prompt(LONGO), jev());
    expect(await r.json()).toEqual({});
    expect((await feed()).prompts[0]).toMatchObject({
      texto: LONGO,
      semaforo: "verde",
      avaliacao: "jev",
      nota: 90,
      faltando: [],
      duracaoMs: 1300,
      criterios: { tamanho: "funcionalidade", ondePct: 90 },
      tokens: { entrada: 900, saida: 12 },
    });
  });

  it("amarelo: o Claude recebe o aviso em additionalContext", async () => {
    // Sessão própria: em sess-1, o prompt seguinte a um amarelo já seria tratado como resposta ao Claude.
    const r = await gancho(post({ ...base, session_id: "sess-amarelo", prompt: LONGO }), jev({ onde: 0.2 }));
    const saida = await r.json();
    expect(saida.hookSpecificOutput.hookEventName).toBe("UserPromptSubmit");
    expect(saida.hookSpecificOutput.additionalContext).toMatch(/^Aviso do Crivo: neste pedido faltou em que tela/);
    expect((await feed()).prompts[0]).toMatchObject({ semaforo: "amarelo", faltando: ["onde"] });
  });

  it("vermelho: bloqueia com o motivo e conta em 'barrados'", async () => {
    const antes = (await feed()).placar.barrados;
    const r = await gancho(prompt(LONGO), jev({ objetivo: 0.1, onde: 0.1, pronto: 0.1 }));
    const saida = await r.json();
    expect(saida.decision).toBe("block");
    expect(saida.reason).toMatch(/^O Crivo barrou este prompt \(nota \d+\)\. Faltou: /);
    const f = await feed();
    expect(f.prompts[0].semaforo).toBe("vermelho");
    expect(f.placar.barrados).toBe(antes + 1);
  });

  it("pressa: passa sem o Jev e o Claude recebe a linha de ignorar a marca", async () => {
    const r = await gancho(prompt(">> faz o relatório do jeito que achar melhor"), naoChamar);
    expect((await r.json()).hookSpecificOutput.additionalContext).toBe(MENSAGEM_PRESSA);
    expect((await feed()).prompts[0]).toMatchObject({ avaliacao: "pressa", semaforo: "verde" });
  });

  it("Jev falhou: passa com {} e guarda o motivo", async () => {
    const r = await gancho(prompt(LONGO), async () => ({ ok: false, motivo: "sem chave TypeSafe", duracaoMs: 0 }));
    expect(await r.json()).toEqual({});
    expect((await feed()).prompts[0]).toMatchObject({ avaliacao: "falhou", motivo: "sem chave TypeSafe", semaforo: "verde" });
  });
});

describe("POST /api/crivo/avaliar (área de teste)", () => {
  const avaliar = (corpo: unknown, avaliador: Avaliador, origens: string[] = []) =>
    respostaAvaliar(
      new Request("http://127.0.0.1:4310/api/crivo/avaliar", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-icewall": "1" },
        body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
      }),
      (origem) => {
        origens.push(origem);
        return avaliador;
      },
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
    expect(depois.ultimoSinal).toBe(antes.ultimoSinal);
  });

  it("a Jev julga com o projeto pedido pela tela, ou o happy-team-chat", async () => {
    const origens: string[] = [];
    await avaliar({ texto: LONGO }, jev(), origens);
    await avaliar({ texto: LONGO, origem: "ICEWALL" }, jev(), origens);
    expect(origens).toEqual(["happy-team-chat", "ICEWALL"]);
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
      return { ok: true, tamanho: "funcionalidade", probTamanho: { ajuste: 0, funcionalidade: 1, sistema: 0 }, objetivo: 0.1, onde: 0.1, pronto: 0.1, mistura: 0.1, duracaoMs: 30, tokens: null };
    };
    const r = await gancho(prompt(LONGO), lento, 10);
    expect(await r.json()).toEqual({});
    const f = await feed();
    expect(f.prompts[0]).toMatchObject({ avaliacao: "falhou", semaforo: "verde", nota: null, motivo: "o Crivo demorou mais que o gancho espera e o prompt passou" });
    expect(f.placar.barrados).toBe(antes);
  });
});

describe("projeto de onde veio o prompt", () => {
  it("o gancho monta o avaliador com a última pasta do cwd", async () => {
    const origens: string[] = [];
    await respostaGanchoPrompt(post({ ...base, session_id: "sess-origem", cwd: "/home/junior/Projects/ICEWALL", prompt: LONGO }), (o) => {
      origens.push(o);
      return jev();
    });
    expect(origens).toEqual(["ICEWALL"]);
  });
});

describe("resposta às perguntas do Claude, no gancho", () => {
  const naSessao = (sessao: string, texto: string) =>
    post({ session_id: sessao, cwd: base.cwd, hook_event_name: "UserPromptSubmit", prompt: texto });
  const bloqueia = jev({ objetivo: 0.1, onde: 0.1, pronto: 0.1 });

  it("depois de um amarelo, a resposta longa da mesma sessão passa sem o Jev; a seguinte volta a ser avaliada", async () => {
    await gancho(naSessao("sess-perguntas", LONGO), jev({ onde: 0.2 }));
    const r = await gancho(naSessao("sess-perguntas", "na tela de relatórios, pronto quando a tabela aparecer"), naoChamar);
    expect(await r.json()).toEqual({});
    expect((await feed()).prompts[0]).toMatchObject({ avaliacao: "resposta", semaforo: "verde", sessao: "sess-perguntas" });
    const depois = await gancho(naSessao("sess-perguntas", LONGO), bloqueia);
    expect((await depois.json()).decision).toBe("block");
  });

  it("o amarelo de uma sessão não libera outra sessão", async () => {
    await gancho(naSessao("sess-a", LONGO), jev({ onde: 0.2 }));
    const r = await gancho(naSessao("sess-b", LONGO), bloqueia);
    expect((await r.json()).decision).toBe("block");
  });
});
