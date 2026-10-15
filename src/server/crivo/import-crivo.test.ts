import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { importarCrivo } from "./import-crivo";

// Esquema do crivo.db v4, como estava no Crivo antes de virar aba do ICEWALL.
const ESQUEMA_V4 = `
CREATE TABLE prompts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, texto TEXT NOT NULL, criado_em TEXT NOT NULL, origem TEXT NOT NULL, sessao TEXT,
  tamanho TEXT, tamanho_pct INTEGER, objetivo_pct INTEGER, onde_pct INTEGER, pronto_pct INTEGER, foco_pct INTEGER,
  nota INTEGER, semaforo TEXT NOT NULL, avaliacao TEXT, duracao_ms INTEGER, faltando TEXT, motivo TEXT);
CREATE TABLE comandos (
  id INTEGER PRIMARY KEY AUTOINCREMENT, criado_em TEXT NOT NULL, origem TEXT NOT NULL, sessao TEXT,
  tipo TEXT NOT NULL, alvo TEXT NOT NULL, regra TEXT, semaforo TEXT NOT NULL);
`;

function crivoV4(): Database.Database {
  const db = new Database(":memory:");
  db.exec(ESQUEMA_V4);
  db.pragma("user_version = 4");
  return db;
}

function icewall(): Database.Database {
  const db = new Database(":memory:");
  migrate(drizzle(db), { migrationsFolder: path.join(__dirname, "..", "..", "..", "drizzle") });
  return db;
}

let origem: Database.Database;
let destino: Database.Database;

beforeEach(() => {
  origem = crivoV4();
  destino = icewall();
  origem
    .prepare(
      `INSERT INTO prompts (id, texto, criado_em, origem, sessao, tamanho, tamanho_pct, objetivo_pct, onde_pct, pronto_pct, foco_pct,
        nota, semaforo, avaliacao, duracao_ms, faltando, motivo)
       VALUES (19, 'pedido vago', '2026-10-09T00:25:55.050Z', 'happy-team-chat', 's1', 'sistema', 89, 30, 7, 9, 79,
        31, 'vermelho', 'jev', 289, '["objetivo","onde","pronto"]', NULL)`,
    )
    .run();
  origem
    .prepare(
      `INSERT INTO prompts (id, texto, criado_em, origem, sessao, semaforo, avaliacao)
       VALUES (3, 'oi', '2026-10-07T23:47:48.135Z', 'happy-team-chat', NULL, 'verde', NULL)`,
    )
    .run();
  origem
    .prepare(
      `INSERT INTO comandos (id, criado_em, origem, sessao, tipo, alvo, regra, semaforo)
       VALUES (1, '2026-10-07T23:42:56.585Z', 'happy-team-chat', 's1', 'comando', 'pnpm test', NULL, 'liberado')`,
    )
    .run();
});

describe("importarCrivo", () => {
  it("copia prompts e comandos com os mesmos ids, horário ISO virando ms", () => {
    expect(importarCrivo(origem, destino)).toEqual({ prompts: 2, comandos: 1 });

    const p = destino.prepare("SELECT * FROM crivo_prompts WHERE id = 19").get();
    expect(p).toEqual({
      id: 19,
      ts: Date.parse("2026-10-09T00:25:55.050Z"),
      texto: "pedido vago",
      origem: "happy-team-chat",
      sessao: "s1",
      tamanho: "sistema",
      tamanho_pct: 89,
      objetivo_pct: 30,
      onde_pct: 7,
      pronto_pct: 9,
      foco_pct: 79,
      nota: 31,
      semaforo: "vermelho",
      avaliacao: "jev",
      duracao_ms: 289,
      faltando: '["objetivo","onde","pronto"]',
      motivo: null,
      jev_input_tokens: null,
      jev_output_tokens: null,
    });
    expect(destino.prepare("SELECT ts, avaliacao, tamanho FROM crivo_prompts WHERE id = 3").get()).toEqual({
      ts: Date.parse("2026-10-07T23:47:48.135Z"),
      avaliacao: null,
      tamanho: null,
    });
    expect(destino.prepare("SELECT * FROM crivo_comandos").all()).toEqual([
      {
        id: 1,
        ts: Date.parse("2026-10-07T23:42:56.585Z"),
        origem: "happy-team-chat",
        sessao: "s1",
        tipo: "comando",
        alvo: "pnpm test",
        regra: null,
        semaforo: "liberado",
      },
    ]);
  });

  it("não mexe na origem", () => {
    importarCrivo(origem, destino);
    expect(origem.prepare("SELECT count(*) AS n FROM prompts").get()).toEqual({ n: 2 });
    expect(origem.prepare("SELECT count(*) AS n FROM comandos").get()).toEqual({ n: 1 });
  });

  it("recusa importar de novo: o ICEWALL já tem dados do Crivo", () => {
    importarCrivo(origem, destino);
    expect(() => importarCrivo(origem, destino)).toThrow(/já tem dados do Crivo/);
    expect(destino.prepare("SELECT count(*) AS n FROM crivo_prompts").get()).toEqual({ n: 2 });
  });

  it("recusa banco do Crivo que não seja v4", () => {
    origem.pragma("user_version = 3");
    expect(() => importarCrivo(origem, destino)).toThrow(/versão 3/);
  });

  it("recusa destino sem as tabelas do Crivo (migração não aplicada)", () => {
    expect(() => importarCrivo(origem, new Database(":memory:"))).toThrow(/crivo_prompts/);
  });

  it("horário ilegível: nada é gravado (uma transação só)", () => {
    origem.prepare(`INSERT INTO comandos (criado_em, origem, tipo, alvo, semaforo) VALUES ('ontem', 'x', 'comando', 'ls', 'liberado')`).run();
    expect(() => importarCrivo(origem, destino)).toThrow(/ontem/);
    expect(destino.prepare("SELECT count(*) AS n FROM crivo_prompts").get()).toEqual({ n: 0 });
    expect(destino.prepare("SELECT count(*) AS n FROM crivo_comandos").get()).toEqual({ n: 0 });
  });
});
