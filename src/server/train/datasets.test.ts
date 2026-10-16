import { describe, expect, it } from "vitest";
import { converterParaJsonl, detectarFormato, normalizarAmostra, parseCsv, slugBase } from "./datasets";

/**
 * Testes unitários da conversão/validação de datasets (Etapa T1) — funções
 * puras, sem banco e sem rede. Os contratos HTTP ficam em route.test.ts.
 */

describe("slugBase", () => {
  it("normaliza nome, acentos e pontuação", () => {
    expect(slugBase("Receitas de Botecos!.jsonl")).toBe("receitas-de-botecos");
    expect(slugBase("Treino É Ação_v2.json")).toBe("treino-e-acao-v2");
  });

  it("recusa vazio com fallback e trunca em 64", () => {
    expect(slugBase("!!!.jsonl")).toBe("dataset");
    expect(slugBase(`${"a".repeat(100)}.jsonl`).length).toBe(64);
  });
});

describe("detectarFormato", () => {
  it("aceita jsonl/json/csv/txt (case-insensitive) e recusa o resto", () => {
    expect(detectarFormato("a.JSONL")).toBe("jsonl");
    expect(detectarFormato("b.Csv")).toBe("csv");
    expect(detectarFormato("c.txt")).toBe("txt");
    expect(detectarFormato("d.parquet")).toBe(null);
  });
});

describe("parseCsv", () => {
  it("lida com vírgula dentro de aspas, aspas escapadas e CRLF", () => {
    const linhas = parseCsv('instruction,input,output\r\n"oi, tudo bem?","x","ele disse ""oi"""');
    expect(linhas).toEqual([["instruction", "input", "output"], ["oi, tudo bem?", "x", 'ele disse "oi"']]);
  });

  it("ignora linhas vazias no fim", () => {
    expect(parseCsv("a,b\n1,2\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("normalizarAmostra (alvo chat)", () => {
  it("mantém messages válidas e recusa roles desconhecidas", () => {
    const ok = { messages: [{ role: "user", content: "oi" }, { role: "assistant", content: "olá" }] };
    expect(normalizarAmostra(ok, "chat")).toEqual(ok);
    expect(normalizarAmostra({ messages: [{ role: "cx", content: "x" }] }, "chat")).toBe(null);
  });

  it("converte Alpaca (instruction/input/output/system)", () => {
    expect(
      normalizarAmostra({ instruction: "Some", input: "2+2", output: "4", system: "calc" }, "chat"),
    ).toEqual({
      messages: [
        { role: "system", content: "calc" },
        { role: "user", content: "Some\n\n2+2" },
        { role: "assistant", content: "4" },
      ],
    });
  });

  it("converte prompt/completion e user/assistant", () => {
    expect(normalizarAmostra({ prompt: "P", completion: "C" }, "chat")).toEqual({
      messages: [{ role: "user", content: "P" }, { role: "assistant", content: "C" }],
    });
    expect(normalizarAmostra({ user: "U", assistant: "A" }, "chat")).toEqual({
      messages: [{ role: "user", content: "U" }, { role: "assistant", content: "A" }],
    });
  });

  it("sem forma de chat, cai para texto quando existe campo textual", () => {
    expect(normalizarAmostra({ content: "apenas texto" }, "chat")).toEqual({ text: "apenas texto" });
    expect(normalizarAmostra({ foo: 1 }, "chat")).toBe(null);
  });
});

describe("normalizarAmostra (alvo texto)", () => {
  it("extrai o primeiro campo textual reconhecido", () => {
    expect(normalizarAmostra({ output: "resposta", instruction: "x" }, "text")).toEqual({ text: "resposta" });
    expect(normalizarAmostra("linha crua", "text")).toEqual({ text: "linha crua" });
    expect(normalizarAmostra({ sem: "texto" }, "text")).toBe(null);
  });
});

describe("converterParaJsonl", () => {
  it("jsonl chat: passa adiante, conta inválidas e duplicadas", () => {
    const texto = [
      JSON.stringify({ messages: [{ role: "user", content: "a" }] }),
      "não é json",
      JSON.stringify({ messages: [{ role: "user", content: "a" }] }), // duplicada
      JSON.stringify({ messages: [{ role: "user", content: "b" }] }),
      "",
    ].join("\n");
    const { validacao } = converterParaJsonl(texto, "jsonl", "chat");
    expect(validacao).toEqual({ total: 2, duplicados: 1, vazios: 1 });
  });

  it("json array alpaca → messages (com system)", () => {
    const { jsonl, validacao } = converterParaJsonl(
      JSON.stringify([
        { instruction: "A", output: "B" },
        { instruction: "C", output: "D", system: "S", input: "I" },
      ]),
      "json",
      "chat",
    );
    const linhas = jsonl.trim().split("\n").map((l) => JSON.parse(l));
    expect(linhas[0]).toEqual({ messages: [{ role: "user", content: "A" }, { role: "assistant", content: "B" }] });
    expect(linhas[1].messages).toHaveLength(3);
    expect(validacao.total).toBe(2);
  });

  it("csv instruction/output → chat", () => {
    const { jsonl, validacao } = converterParaJsonl(
      "instruction,output\nPergunta 1,Resposta 1\nPergunta 2,Resposta 2\n",
      "csv",
      "chat",
    );
    expect(validacao.total).toBe(2);
    const primeira = JSON.parse(jsonl.split("\n")[0]);
    expect(primeira.messages[0].role).toBe("user");
    expect(primeira.messages[0].content).toBe("Pergunta 1");
  });

  it("csv sem colunas conhecidas usa a primeira coluna como texto", () => {
    const { validacao } = converterParaJsonl("texto\nlinha 1\nlinha 2\n", "csv", "chat");
    expect(validacao.total).toBe(2);
  });

  it("txt → { text }, uma amostra por linha não vazia", () => {
    const { jsonl, validacao } = converterParaJsonl("primeira\n\nsegunda\n", "txt", "text");
    expect(jsonl).toBe('{"text":"primeira"}\n{"text":"segunda"}\n');
    expect(validacao).toEqual({ total: 2, duplicados: 0, vazios: 0 });
  });

  it("arquivo sem amostras válidas devolve total 0 e jsonl vazio", () => {
    const { jsonl, validacao } = converterParaJsonl("", "txt", "chat");
    expect(jsonl).toBe("");
    expect(validacao.total).toBe(0);
  });
});
