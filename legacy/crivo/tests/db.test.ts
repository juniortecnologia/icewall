import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { VERSAO_ESQUEMA, abrirBanco, claudePerguntou, inserirComando, inserirPrompt, lerFeed, lerPlacar } from "@/lib/db";
import type { NovoComando, NovoPrompt } from "@/lib/tipos";

const novoPrompt = (extra: Partial<NovoPrompt> = {}): NovoPrompt => ({
  texto: "corrige o login",
  criadoEm: "2026-10-07T12:00:00.000Z",
  origem: "happy-team-chat",
  sessao: "sess-1",
  criterios: null,
  nota: null,
  semaforo: "verde",
  avaliacao: "curta",
  duracaoMs: null,
  faltando: null,
  motivo: null,
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
  it("sem nota: grava, lê igual e conta em 'passaram'", () => {
    const db = abrirBanco(":memory:");
    const texto = "linha 1\nlinha 2 com 'aspas', <b>html</b> e emoji 🚦";
    const p = inserirPrompt(db, novoPrompt({ texto }));
    expect(p.semaforo).toBe("verde");
    expect(lerFeed(db).prompts).toEqual([p]);
    expect(lerPlacar(db).passaram).toBe(1);
  });

  it("avaliado pelo Jev: grava cor, critérios, faltando e duração como vieram (a cor não sai da nota)", () => {
    const db = abrirBanco(":memory:");
    const criterios = { tamanho: "funcionalidade" as const, tamanhoPct: 50, objetivoPct: 90, ondePct: 30, prontoPct: 90, focoPct: 90 };
    const p = inserirPrompt(
      db,
      novoPrompt({ nota: 75, criterios, semaforo: "amarelo", avaliacao: "jev", duracaoMs: 1312, faltando: ["onde"] }),
    );
    expect(p.semaforo).toBe("amarelo");
    expect(lerFeed(db).prompts[0]).toEqual(p);
    expect(lerPlacar(db).perguntas).toBe(1);
  });

  it("Jev falhou: guarda o motivo", () => {
    const db = abrirBanco(":memory:");
    inserirPrompt(db, novoPrompt({ avaliacao: "falhou", motivo: "TypeSafe indisponível", duracaoMs: 8001 }));
    expect(lerFeed(db).prompts[0]).toMatchObject({ avaliacao: "falhou", motivo: "TypeSafe indisponível", faltando: null });
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

describe("claudePerguntou", () => {
  it("vale só quando o último prompt da sessão foi amarelo avaliado pelo Jev", () => {
    const db = abrirBanco(":memory:");
    expect(claudePerguntou(db, "sess-1")).toBe(false);
    inserirPrompt(db, novoPrompt({ semaforo: "amarelo", avaliacao: "jev", faltando: ["onde"] }));
    expect(claudePerguntou(db, "sess-1")).toBe(true);
    expect(claudePerguntou(db, "outra-sessao")).toBe(false);
    inserirPrompt(db, novoPrompt({ avaliacao: "resposta" }));
    expect(claudePerguntou(db, "sess-1")).toBe(false);
  });

  it("vermelho não conta: o prompt barrado nem chegou ao Claude", () => {
    const db = abrirBanco(":memory:");
    inserirPrompt(db, novoPrompt({ semaforo: "vermelho", avaliacao: "jev", nota: 20, faltando: ["objetivo", "onde", "pronto"] }));
    expect(claudePerguntou(db, "sess-1")).toBe(false);
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

  it("banco de versão mais nova que este código: recusa abrir em vez de apagar dados reais", () => {
    const caminho = arquivoTemporario();
    const a = abrirBanco(caminho);
    inserirPrompt(a, novoPrompt());
    a.pragma(`user_version = ${VERSAO_ESQUEMA + 1}`);
    a.close();
    expect(() => abrirBanco(caminho)).toThrow(/versão/);
    const b = new Database(caminho);
    expect((b.prepare("SELECT COUNT(*) AS n FROM prompts").get() as { n: number }).n).toBe(1);
    b.close();
  });

  it("banco v2 com dados vira v3 sem perder nada; prompts antigos ficam sem avaliação", () => {
    const caminho = arquivoTemporario();
    const v2 = new Database(caminho);
    v2.exec(`
      CREATE TABLE prompts (
        id INTEGER PRIMARY KEY AUTOINCREMENT, texto TEXT NOT NULL, criado_em TEXT NOT NULL, origem TEXT NOT NULL, sessao TEXT,
        tamanho TEXT CHECK (tamanho IN ('ajuste', 'funcionalidade', 'sistema')),
        tamanho_pct INTEGER, objetivo_pct INTEGER, onde_pct INTEGER, pronto_pct INTEGER, foco_pct INTEGER, nota INTEGER,
        semaforo TEXT NOT NULL CHECK (semaforo IN ('verde', 'amarelo', 'vermelho')));
      CREATE TABLE comandos (
        id INTEGER PRIMARY KEY AUTOINCREMENT, criado_em TEXT NOT NULL, origem TEXT NOT NULL, sessao TEXT,
        tipo TEXT NOT NULL, alvo TEXT NOT NULL, regra TEXT, semaforo TEXT NOT NULL);
      INSERT INTO prompts (texto, criado_em, origem, sessao, semaforo) VALUES ('prompt da etapa 2', '2026-10-07T10:00:00.000Z', 'happy-team-chat', 's', 'verde');
      INSERT INTO comandos (criado_em, origem, sessao, tipo, alvo, semaforo) VALUES ('2026-10-07T10:00:01.000Z', 'happy-team-chat', 's', 'comando', 'ls', 'liberado');
      PRAGMA user_version = 2;`);
    v2.close();

    const db = abrirBanco(caminho);
    expect(db.pragma("user_version", { simple: true })).toBe(VERSAO_ESQUEMA);
    const feed = lerFeed(db);
    expect(feed.prompts).toHaveLength(1);
    expect(feed.prompts[0]).toMatchObject({ texto: "prompt da etapa 2", avaliacao: null, duracaoMs: null, faltando: null, motivo: null });
    expect(feed.comandos).toHaveLength(1);
    inserirPrompt(db, novoPrompt({ avaliacao: "jev", faltando: ["objetivo", "mistura"], semaforo: "amarelo" }));
    expect(lerFeed(db).prompts[0].faltando).toEqual(["objetivo", "mistura"]);
    db.close();
  });

  it("banco v3 com dados vira v4 sem perder nada e aceita a avaliação 'resposta'", () => {
    const caminho = arquivoTemporario();
    const v3 = new Database(caminho);
    v3.exec(`
      CREATE TABLE prompts (
        id INTEGER PRIMARY KEY AUTOINCREMENT, texto TEXT NOT NULL, criado_em TEXT NOT NULL, origem TEXT NOT NULL, sessao TEXT,
        tamanho TEXT CHECK (tamanho IN ('ajuste', 'funcionalidade', 'sistema')),
        tamanho_pct INTEGER, objetivo_pct INTEGER, onde_pct INTEGER, pronto_pct INTEGER, foco_pct INTEGER, nota INTEGER,
        semaforo TEXT NOT NULL CHECK (semaforo IN ('verde', 'amarelo', 'vermelho')),
        avaliacao TEXT CHECK (avaliacao IN ('jev', 'pressa', 'curta', 'falhou')), duracao_ms INTEGER, faltando TEXT, motivo TEXT);
      CREATE TABLE comandos (
        id INTEGER PRIMARY KEY AUTOINCREMENT, criado_em TEXT NOT NULL, origem TEXT NOT NULL, sessao TEXT,
        tipo TEXT NOT NULL, alvo TEXT NOT NULL, regra TEXT, semaforo TEXT NOT NULL);
      INSERT INTO prompts (texto, criado_em, origem, sessao, semaforo, avaliacao, duracao_ms, faltando)
        VALUES ('prompt da etapa 3', '2026-10-07T10:00:00.000Z', 'happy-team-chat', 's', 'amarelo', 'jev', 900, '["onde"]');
      PRAGMA user_version = 3;`);
    v3.close();

    const db = abrirBanco(caminho);
    expect(db.pragma("user_version", { simple: true })).toBe(VERSAO_ESQUEMA);
    expect(lerFeed(db).prompts[0]).toMatchObject({ id: 1, texto: "prompt da etapa 3", avaliacao: "jev", duracaoMs: 900, faltando: ["onde"] });
    inserirPrompt(db, novoPrompt({ avaliacao: "resposta" }));
    expect(lerFeed(db).prompts.map((p) => p.avaliacao)).toEqual(["resposta", "jev"]);
    db.close();
  });
});
