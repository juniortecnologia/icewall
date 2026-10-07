import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { abrirBanco, inserirComando, inserirPrompt, lerFeed, lerPlacar } from "@/lib/db";
import { exemplosComandos, exemplosPrompts } from "@/lib/exemplos";

const novoBanco = () => abrirBanco(":memory:", Date.parse("2026-10-06T15:00:00Z"));

describe("abrirBanco", () => {
  it("cria as tabelas e grava os exemplos uma vez", () => {
    const feed = lerFeed(novoBanco());
    expect(feed.prompts).toHaveLength(exemplosPrompts.length);
    expect(feed.comandos).toHaveLength(exemplosComandos.length);
  });

  it("não duplica os exemplos quando o banco já tem dados", () => {
    // simula um reinício: abre de novo o mesmo arquivo
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "crivo-"));
    const caminho = path.join(pasta, "teste.db");
    abrirBanco(caminho).close();
    const b = abrirBanco(caminho);
    expect(lerFeed(b).prompts).toHaveLength(exemplosPrompts.length);
    expect(lerFeed(b).comandos).toHaveLength(exemplosComandos.length);
    b.close();
    fs.rmSync(pasta, { recursive: true, force: true });
  });
});

describe("exemplos obrigatórios", () => {
  it("'faz uns relatórios aí' é vermelho e o relatório detalhado é verde", () => {
    const { prompts } = lerFeed(novoBanco());
    expect(prompts.find((p) => p.texto === "faz uns relatórios aí")?.semaforo).toBe("vermelho");
    const detalhado = prompts.find((p) => p.texto.includes("/admin/relatorios/vendas-mensais"));
    expect(detalhado?.semaforo).toBe("verde");
  });

  it("tem as três cores na entrada e as duas na saída", () => {
    const { prompts, comandos } = lerFeed(novoBanco());
    expect(new Set(prompts.map((p) => p.semaforo))).toEqual(new Set(["verde", "amarelo", "vermelho"]));
    expect(new Set(comandos.map((c) => c.semaforo))).toEqual(new Set(["liberado", "segurado"]));
  });

  it("todo comando segurado tem regra e todo liberado não tem", () => {
    for (const c of lerFeed(novoBanco()).comandos) {
      expect(c.semaforo === "segurado").toBe(c.regra !== null);
    }
  });
});

describe("lerFeed", () => {
  it("devolve o mais novo primeiro", () => {
    const { prompts, comandos } = lerFeed(novoBanco());
    const ordenado = (xs: { criadoEm: string }[]) =>
      xs.every((x, i) => i === 0 || xs[i - 1].criadoEm >= x.criadoEm);
    expect(ordenado(prompts)).toBe(true);
    expect(ordenado(comandos)).toBe(true);
  });

  it("respeita o limite de itens", () => {
    const { prompts, comandos } = lerFeed(novoBanco(), 3);
    expect(prompts).toHaveLength(3);
    expect(comandos).toHaveLength(3);
  });
});

describe("inserção", () => {
  it("calcula o semáforo e grava texto perigoso sem mudar nada", () => {
    const db = novoBanco();
    const texto = `'; DROP TABLE prompts; -- <b>oi</b> "aspas"`;
    const p = inserirPrompt(db, {
      texto,
      criadoEm: "2026-10-06T16:00:00.000Z",
      nota: 39,
      criterios: { tamanho: "ajuste", tamanhoPct: 10, objetivoPct: 50, ondePct: 50, prontoPct: 20, focoPct: 30 },
    });
    expect(p.semaforo).toBe("vermelho");
    expect(lerFeed(db).prompts[0]).toEqual(p);

    const c = inserirComando(db, {
      tipo: "comando",
      alvo: `echo '$(rm -rf /)'`,
      regra: "Nunca apagar com rm -rf fora de /tmp",
      criadoEm: "2026-10-06T16:00:01.000Z",
    });
    expect(c.semaforo).toBe("segurado");
    expect(lerFeed(db).comandos[0]).toEqual(c);
  });
});

describe("lerPlacar", () => {
  it("conta o banco inteiro, não só o que aparece no feed", () => {
    const db = novoBanco();
    const antes = lerPlacar(db);
    expect(antes).toEqual({ passaram: 5, perguntas: 3, barrados: 3, segurados: 6 });
    for (let i = 0; i < 60; i++) {
      inserirComando(db, { tipo: "comando", alvo: `rm -rf /x${i}`, regra: "regra", criadoEm: "2026-10-06T16:00:00.000Z" });
    }
    expect(lerPlacar(db).segurados).toBe(66);
    expect(lerFeed(db).comandos).toHaveLength(50);
  });
});
