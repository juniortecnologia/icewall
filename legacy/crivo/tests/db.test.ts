import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { VERSAO_ESQUEMA, abrirBanco, inserirComando, inserirPrompt, lerFeed, lerPlacar } from "@/lib/db";
import type { NovoComando, NovoPrompt } from "@/lib/tipos";

const novoPrompt = (extra: Partial<NovoPrompt> = {}): NovoPrompt => ({
  texto: "corrige o login",
  criadoEm: "2026-10-07T12:00:00.000Z",
  origem: "happy-team-chat",
  sessao: "sess-1",
  criterios: null,
  nota: null,
  ...extra,
});

const novoComando = (extra: Partial<NovoComando> = {}): NovoComando => ({
  tipo: "comando",
  alvo: "pnpm test",
  regra: null,
  criadoEm: "2026-10-07T12:00:01.000Z",
  origem: "happy-team-chat",
  sessao: "sess-1",
  ...extra,
});

const pastas: string[] = [];
const arquivoTemporario = () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "crivo-"));
  pastas.push(pasta);
  return path.join(pasta, "teste.db");
};
afterEach(() => {
  for (const p of pastas.splice(0)) fs.rmSync(p, { recursive: true, force: true });
});

describe("banco novo", () => {
  it("começa vazio: sem dados de mentira", () => {
    const feed = lerFeed(abrirBanco(":memory:"));
    expect(feed.prompts).toEqual([]);
    expect(feed.comandos).toEqual([]);
    expect(feed.placar).toEqual({ passaram: 0, perguntas: 0, barrados: 0, segurados: 0 });
  });
});

describe("prompts", () => {
  it("sem nota: grava, lê igual, fica verde e conta em 'passaram'", () => {
    const db = abrirBanco(":memory:");
    const texto = "linha 1\nlinha 2 com 'aspas', <b>html</b> e emoji 🚦";
    const p = inserirPrompt(db, novoPrompt({ texto }));
    expect(p.semaforo).toBe("verde");
    expect(lerFeed(db).prompts).toEqual([p]);
    expect(lerPlacar(db).passaram).toBe(1);
  });

  it("com nota: grava os critérios e a cor segue a nota", () => {
    const db = abrirBanco(":memory:");
    const criterios = { tamanho: "ajuste" as const, tamanhoPct: 10, objetivoPct: 50, ondePct: 50, prontoPct: 20, focoPct: 30 };
    const p = inserirPrompt(db, novoPrompt({ nota: 39, criterios }));
    expect(p.semaforo).toBe("vermelho");
    expect(lerFeed(db).prompts[0]).toEqual(p);
  });

  it("prompt enorme é gravado inteiro", () => {
    const db = abrirBanco(":memory:");
    const texto = "x".repeat(200_000);
    inserirPrompt(db, novoPrompt({ texto }));
    expect(lerFeed(db).prompts[0].texto).toHaveLength(200_000);
  });
});

describe("comandos", () => {
  it("grava origem e sessão; sem regra é liberado", () => {
    const db = abrirBanco(":memory:");
    const c = inserirComando(db, novoComando({ sessao: null }));
    expect(c.semaforo).toBe("liberado");
    expect(lerFeed(db).comandos).toEqual([c]);
  });
});

describe("lerFeed e lerPlacar", () => {
  it("mais novo primeiro, limitado, e o placar conta o banco inteiro", () => {
    const db = abrirBanco(":memory:");
    for (let i = 0; i < 60; i++) {
      inserirComando(
        db,
        novoComando({
          alvo: `cmd ${i}`,
          regra: i % 2 ? "regra" : null,
          criadoEm: `2026-10-07T12:${String(i).padStart(2, "0")}:00.000Z`,
        }),
      );
    }
    const feed = lerFeed(db);
    expect(feed.comandos).toHaveLength(50);
    expect(feed.comandos[0].alvo).toBe("cmd 59");
    expect(feed.placar.segurados).toBe(30);
  });
});

describe("migração", () => {
  it("banco da etapa 1 (com dados de mentira) é recriado vazio no esquema novo", () => {
    const caminho = arquivoTemporario();
    const antigo = new Database(caminho);
    antigo.exec(`CREATE TABLE prompts (id INTEGER PRIMARY KEY, texto TEXT NOT NULL, criado_em TEXT NOT NULL, nota INTEGER NOT NULL, semaforo TEXT NOT NULL);
                 CREATE TABLE comandos (id INTEGER PRIMARY KEY, criado_em TEXT NOT NULL, tipo TEXT, alvo TEXT, regra TEXT, semaforo TEXT);
                 INSERT INTO prompts (texto, criado_em, nota, semaforo) VALUES ('faz uns relatórios aí', 'x', 12, 'vermelho');`);
    antigo.close();

    const db = abrirBanco(caminho);
    expect(lerFeed(db).prompts).toEqual([]);
    expect(db.pragma("user_version", { simple: true })).toBe(VERSAO_ESQUEMA);
    expect(inserirPrompt(db, novoPrompt()).origem).toBe("happy-team-chat");
    db.close();
  });

  it("banco já na versão nova não é apagado ao reabrir", () => {
    const caminho = arquivoTemporario();
    const a = abrirBanco(caminho);
    inserirPrompt(a, novoPrompt());
    inserirComando(a, novoComando());
    a.close();
    const b = abrirBanco(caminho);
    expect(lerFeed(b).prompts).toHaveLength(1);
    expect(lerFeed(b).comandos).toHaveLength(1);
    b.close();
  });
});
