import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CENARIOS,
  cenariosAplicaveis,
  comandoCenario,
  comandoSubir,
  lerCombinacoes,
  lerSaida,
  resumoCarga,
  type Combinacao,
} from "./spark";

function pasta(arquivos: Record<string, unknown>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "icewall-comb-"));
  for (const [nome, conteudo] of Object.entries(arquivos)) fs.writeFileSync(path.join(dir, nome), JSON.stringify(conteudo));
  return dir;
}

const chat = { container: "glis-chat", script: "serve-chat.sh", args: ["0.24", "2", "16"] };
const valida = { titulo: "T", descricao: "D", servicos: [chat] };

describe("lerCombinacoes", () => {
  it("lê as combinações do repositório", () => {
    const todas = lerCombinacoes();
    expect(todas.map((c) => c.id)).toContain("glis-atual");
    expect(todas.find((c) => c.id === "glis-atual")?.servicos).toHaveLength(4);
  });

  it("o id vem do nome do arquivo e o gate é falso por padrão", () => {
    const [c] = lerCombinacoes(pasta({ "minha-comb.json": valida }));
    expect(c).toMatchObject({ id: "minha-comb", titulo: "T", gate: false });
  });

  it.each([
    ["script fora dos serve-*.sh", { ...valida, servicos: [{ ...chat, script: "../../bin/sh" }] }],
    ["container fora dos glis-*", { ...valida, servicos: [{ ...chat, container: "ollama" }] }],
    ["argumento com espaço", { ...valida, servicos: [{ ...chat, args: ["0.24; rm -rf ~"] }] }],
    ["argumento com aspas", { ...valida, servicos: [{ ...chat, args: ["'x'"] }] }],
    ["argumento com $", { ...valida, servicos: [{ ...chat, args: ["$(id)"] }] }],
    ["sem serviços", { ...valida, servicos: [] }],
  ])("recusa %s", (_, conteudo) => {
    expect(() => lerCombinacoes(pasta({ "ruim.json": conteudo }))).toThrow();
  });

  it("aceita JSON de configuração do vLLM como argumento (o serve-nemo.sh não usa, mas números e pontos sim)", () => {
    const [c] = lerCombinacoes(pasta({ "x.json": { ...valida, servicos: [{ ...chat, args: ["embed", "0.09"] }] } }));
    expect(c.servicos[0].args).toEqual(["embed", "0.09"]);
  });

  it("recusa id de arquivo com caracteres estranhos", () => {
    expect(() => lerCombinacoes(pasta({ "Com Espaço.json": valida }))).toThrow();
  });
});

describe("comandos", () => {
  it("subir: cada pedaço entre aspas simples, a partir da pasta da bancada", () => {
    expect(comandoSubir(chat)).toBe("cd ~/icewall-bench && ./subir.sh 'glis-chat' 'serve-chat.sh' '0.24' '2' '16'");
  });

  it("cenário: roda sob o medir.sh com python3", () => {
    expect(comandoCenario("rag-qualidade")).toBe("cd ~/icewall-bench && ./medir.sh python3 'qual_rag.py' '8000' 'chat'");
  });

  it("todo cenário tem script .py e argumentos seguros", () => {
    for (const id of Object.keys(CENARIOS) as (keyof typeof CENARIOS)[]) expect(() => comandoCenario(id)).not.toThrow();
  });
});

describe("cenariosAplicaveis", () => {
  const comb = (containers: string[]): Combinacao => ({
    id: "c",
    titulo: "c",
    descricao: "",
    gate: false,
    servicos: containers.map((container) => ({ container, script: "serve-chat.sh", args: [] })),
  });

  it("só o chat: carga, RAG, contexto longo e imagem; nada que dependa de código, embed ou rerank", () => {
    const ids = cenariosAplicaveis(comb(["glis-chat"]), Object.keys(CENARIOS));
    expect(ids).toEqual(expect.arrayContaining(["carga", "rag-qualidade", "contexto-longo", "imagem"]));
    expect(ids).not.toContain("soak");
    expect(ids).not.toContain("convivencia");
  });

  it("convivência realista com o agente só onde há glis-code", () => {
    const todos = Object.keys(CENARIOS);
    expect(cenariosAplicaveis(comb(["glis-chat", "glis-embed", "glis-rerank"]), todos)).toEqual(
      expect.arrayContaining(["carga-real", "convivencia-real-sem-codigo", "convivencia-real-sem-codigo-gate-img"]),
    );
    expect(cenariosAplicaveis(comb(["glis-chat", "glis-embed", "glis-rerank"]), todos)).not.toContain("convivencia-real");
    expect(comandoCenario("convivencia-real-gate-img")).toBe(
      "cd ~/icewall-bench && ./medir.sh python3 'carga_real.py' '--users' '7' '--dur' '300' '--code' '--img' '30' '--gate-img' '--rag'",
    );
  });

  it("agente no próprio chat roda sem glis-code; o de contexto longo no glis-code exige o glis-code", () => {
    const semCodigo = cenariosAplicaveis(comb(["glis-chat", "glis-embed", "glis-rerank"]), Object.keys(CENARIOS));
    expect(semCodigo).toEqual(expect.arrayContaining(["convivencia-real-agente-no-chat", "convivencia-real-agente-no-chat-longo"]));
    expect(semCodigo).not.toContain("convivencia-real-agente-longo");
    expect(comandoCenario("convivencia-real-agente-no-chat")).toBe(
      "cd ~/icewall-bench && ./medir.sh python3 'carga_real.py' '--users' '7' '--dur' '300' '--code' '--code-port' '8000' '--code-model' 'chat' '--code-priority' '10' '--img' '30' '--rag'",
    );
  });

  it("as combinações dos agentes MoE e do modelo só usam o slot certo", () => {
    const todas = lerCombinacoes();
    expect(todas.find((c) => c.id === "qwen-agente-no-chat")?.servicos.map((s) => s.container)).not.toContain("glis-code");
    expect(todas.find((c) => c.id === "qwen-com-gemma-agente")?.servicos[0]).toMatchObject({ container: "glis-code", script: "serve-gemma.sh" });
    expect(todas.find((c) => c.id === "qwen-com-gptoss-agente")?.servicos[0]).toMatchObject({ container: "glis-code", script: "serve-gptoss.sh" });
  });

  it("respeita a ordem e a seleção pedidas", () => {
    expect(cenariosAplicaveis(comb(["glis-chat"]), ["imagem", "carga"])).toEqual(["imagem", "carga"]);
  });
});

describe("lerSaida", () => {
  it("separa as linhas JSON, a memória mínima e o texto", () => {
    const out = [
      '{"conc": 1, "ok": 1, "erros": 0, "ttft_med": 0.4, "dec_tps_por_req": 98.1}',
      '{"conc": 7, "ok": 7, "erros": 0, "ttft_med": 2.9, "ttft_p95": 3.4, "dec_tps_por_req": 41.2}',
      "# comentário qualquer",
      '{"mem_min_disponivel_mb": 11106}',
    ].join("\n");
    const s = lerSaida(out);
    expect(s.linhas).toHaveLength(2);
    expect(s.linhas[1]).toMatchObject({ conc: 7, dec_tps_por_req: 41.2 });
    expect(s.memMinMb).toBe(11106);
    expect(s.texto).toContain("# comentário qualquer");
    expect(s.acertos).toBeNull();
  });

  it("lê o TOTAL do qual_rag.py", () => {
    const s = lerSaida("[OK] (fato, 12 tok) Qual?\n      → argon2id\n\nTOTAL chat think=False: 9/10\n");
    expect(s.acertos).toEqual({ ok: 9, total: 10 });
    expect(s.linhas).toEqual([]);
    expect(s.texto).toContain("[OK] (fato, 12 tok) Qual?");
  });

  it("ignora JSON quebrado e listas soltas", () => {
    const s = lerSaida('{"conc": 1,\n[1,2]\n{"a": 1}');
    expect(s.linhas).toEqual([{ a: 1 }]);
  });

  it("saída vazia", () => {
    expect(lerSaida("")).toEqual({ linhas: [], memMinMb: null, acertos: null, texto: "" });
  });
});

describe("resumoCarga", () => {
  const linhas = [
    { conc: 1, ok: 1, erros: 0, ttft_p95: 0.4, dec_tps_por_req: 98 },
    { conc: 7, ok: 7, erros: 0, ttft_p95: 3.4, dec_tps_por_req: 41.2 },
    { conc: 10, ok: 10, erros: 0, ttft_p95: 6.1, dec_tps_por_req: 30 },
  ];

  it("passa com 7 simultâneos: TTFT p95 ≤ 5 s e ≥ 35 tok/s por pedido, sem erros", () => {
    expect(resumoCarga(linhas)).toEqual({ ttftP95: 3.4, tokSPorUsuario: 41.2, erros: 0, passa: true, motivos: [] });
  });

  it("reprova e diz por quê", () => {
    const r = resumoCarga([{ conc: 7, ok: 6, erros: 1, ttft_p95: 8.9, dec_tps_por_req: 25 }]);
    expect(r?.passa).toBe(false);
    expect(r?.motivos).toEqual(["primeiro token em 8,9 s (meta ≤ 5 s)", "25 tok/s por usuário (meta ≥ 35)", "1 erro"]);
  });

  it("sem a linha de 7 simultâneos não há veredito", () => {
    expect(resumoCarga([linhas[0]])).toBeNull();
  });
});
