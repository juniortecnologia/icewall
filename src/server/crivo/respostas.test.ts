import { describe, expect, it, vi } from "vitest";
import { MENSAGEM_PRESSA } from "@/server/crivo/decisao";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { montarFeed, respostaAvaliar, respostaGanchoFerramenta, respostaGanchoPrompt, respostaProjeto } from "@/server/crivo/respostas";
import type { Avaliador, Decisao, Feed, RespostaJev } from "@/server/crivo/tipos";

// O setup do Vitest dá a este arquivo um banco em memória. Os testes compartilham esse banco e rodam em ordem.

const post = (corpo: unknown) =>
  new Request("http://127.0.0.1:4310/api/crivo/hooks/x", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-icewall": "1" },
    body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });
const feed = async (origem: string | null = null): Promise<Feed> => montarFeed(origem);
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
/** O handler recebe uma fábrica por descrição do projeto; aqui todas usam o mesmo avaliador. */
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
      (descricao) => {
        origens.push(descricao);
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

  it("a Jev julga com a descrição do projeto pedido pela tela; sem projeto, uma genérica", async () => {
    const descricoes: string[] = [];
    await avaliar({ texto: LONGO }, jev(), descricoes);
    await avaliar({ texto: LONGO, origem: "projeto-que-nunca-mandou-gancho" }, jev(), descricoes);
    expect(descricoes).toEqual(["um projeto de software", "projeto-que-nunca-mandou-gancho"]);
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
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "crivo-projetos-"));
  const pasta = (nome: string, readme?: string) => {
    const dir = path.join(raiz, nome);
    fs.mkdirSync(dir, { recursive: true });
    if (readme !== undefined) fs.writeFileSync(path.join(dir, "README.md"), readme);
    return dir;
  };
  const descricoesDo = async (cwd: string, sessao: string) => {
    const descricoes: string[] = [];
    await respostaGanchoPrompt(post({ session_id: sessao, cwd, prompt: LONGO }), (d) => {
      descricoes.push(d);
      return jev();
    });
    return descricoes;
  };
  const mudar = (corpo: unknown) =>
    respostaProjeto(
      new Request("http://127.0.0.1:4310/api/crivo/projetos", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-icewall": "1" },
        body: JSON.stringify(corpo),
      }),
    );

  it("sem README, a Jev recebe o nome da pasta; o projeto entra na lista", async () => {
    expect(await descricoesDo(pasta("sem-readme"), "sess-p1")).toEqual(["sem-readme"]);
    expect((await feed()).projetos.find((p) => p.origem === "sem-readme")).toMatchObject({ fonte: "pasta", descricao: "sem-readme", desligado: false, prompts: 1 });
  });

  it("com README, a Jev recebe o título e o primeiro parágrafo", async () => {
    const cwd = pasta("com-readme", "# Loja\n\nLoja virtual de discos usados.\n");
    expect(await descricoesDo(cwd, "sess-p2")).toEqual(["Loja: Loja virtual de discos usados."]);
  });

  it("a descrição escrita na aba vence o README; null volta para o automático", async () => {
    const cwd = path.join(raiz, "com-readme");
    const r = await mudar({ origem: "com-readme", descricao: "  Loja de discos,\n só vinil  " });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ descricao: "Loja de discos, só vinil", fonte: "manual" });
    expect(await descricoesDo(cwd, "sess-p3")).toEqual(["Loja de discos, só vinil"]);
    await mudar({ origem: "com-readme", descricao: null });
    expect(await descricoesDo(cwd, "sess-p4")).toEqual(["Loja: Loja virtual de discos usados."]);
  });

  it("a área de teste usa a mesma descrição do projeto", async () => {
    const descricoes: string[] = [];
    await respostaAvaliar(
      new Request("http://127.0.0.1:4310/api/crivo/avaliar", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-icewall": "1" },
        body: JSON.stringify({ texto: LONGO, origem: "com-readme" }),
      }),
      (d) => {
        descricoes.push(d);
        return jev();
      },
    );
    expect(descricoes).toEqual(["Loja: Loja virtual de discos usados."]);
  });

  it("projeto desligado: os dois ganchos respondem {} sem gravar e sem chamar a Jev", async () => {
    const cwd = pasta("desligado");
    await respostaGanchoFerramenta(post({ session_id: "sess-d", cwd, tool_name: "Bash", tool_input: { command: "ls" } }));
    expect((await mudar({ origem: "desligado", desligado: true })).status).toBe(200);
    const antes = await feed("desligado");
    const r = await respostaGanchoPrompt(post({ session_id: "sess-d", cwd, prompt: LONGO }), () => naoChamar);
    expect(await r.json()).toEqual({});
    const t = await respostaGanchoFerramenta(post({ session_id: "sess-d", cwd, tool_name: "Bash", tool_input: { command: "rm -rf x" } }));
    expect(await t.json()).toEqual({});
    const depois = await feed("desligado");
    expect(total(depois)).toBe(total(antes));
    expect(depois.projetos.find((p) => p.origem === "desligado")?.desligado).toBe(true);
  });

  it("o feed filtra por projeto", async () => {
    const f = await feed("sem-readme");
    expect(f.origem).toBe("sem-readme");
    expect(f.prompts.length).toBeGreaterThan(0);
    expect(f.prompts.every((p) => p.origem === "sem-readme")).toBe(true);
    expect(f.comandos.every((c) => c.origem === "sem-readme")).toBe(true);
    expect(f.placar.passaram).toBe(f.prompts.filter((p) => p.semaforo === "verde").length);
  });

  it.each([
    ["sem origem", { descricao: "x" }, 400],
    ["descrição que não é texto", { origem: "sem-readme", descricao: 5 }, 400],
    ["descrição longa demais", { origem: "sem-readme", descricao: "x".repeat(301) }, 400],
    ["desligado que não é booleano", { origem: "sem-readme", desligado: "sim" }, 400],
    ["projeto que o Crivo nunca viu", { origem: "nunca-visto", desligado: true }, 404],
  ])("POST /api/crivo/projetos recusa: %s", async (_, corpo, status) => {
    expect((await mudar(corpo)).status).toBe(status);
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

  it("uma notificação do Claude Code entre a pergunta e a resposta não quebra a resposta", async () => {
    await gancho(naSessao("sess-notif", LONGO), jev({ onde: 0.2 }));
    await gancho(naSessao("sess-notif", "<task-notification>\n<status>completed</status>\n</task-notification>"), naoChamar);
    expect((await feed()).prompts[0]).toMatchObject({ avaliacao: "notificacao", semaforo: "verde" });
    await gancho(naSessao("sess-notif", "na tela de relatórios, pronto quando a tabela aparecer"), naoChamar);
    expect((await feed()).prompts[0]).toMatchObject({ avaliacao: "resposta" });
  });

  it("o amarelo de uma sessão não libera outra sessão", async () => {
    await gancho(naSessao("sess-a", LONGO), jev({ onde: 0.2 }));
    const r = await gancho(naSessao("sess-b", LONGO), bloqueia);
    expect((await r.json()).decision).toBe("block");
  });
});
