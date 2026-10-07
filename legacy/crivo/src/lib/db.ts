import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { calcularNota, semaforoDaNota, semaforoDoComando } from "./avaliacao";
import { exemplosComandos, exemplosPrompts } from "./exemplos";
import type {
  Comando,
  Feed,
  NovoComando,
  NovoPrompt,
  Placar,
  Prompt,
  Semaforo,
  SemaforoSaida,
  Tamanho,
  TipoAlvo,
} from "./tipos";

export type Banco = Database.Database;

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS prompts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  texto        TEXT    NOT NULL,
  criado_em    TEXT    NOT NULL,
  tamanho      TEXT    NOT NULL CHECK (tamanho IN ('ajuste', 'funcionalidade', 'sistema')),
  tamanho_pct  INTEGER NOT NULL CHECK (tamanho_pct  BETWEEN 0 AND 100),
  objetivo_pct INTEGER NOT NULL CHECK (objetivo_pct BETWEEN 0 AND 100),
  onde_pct     INTEGER NOT NULL CHECK (onde_pct     BETWEEN 0 AND 100),
  pronto_pct   INTEGER NOT NULL CHECK (pronto_pct   BETWEEN 0 AND 100),
  foco_pct     INTEGER NOT NULL CHECK (foco_pct     BETWEEN 0 AND 100),
  nota         INTEGER NOT NULL CHECK (nota         BETWEEN 0 AND 100),
  semaforo     TEXT    NOT NULL CHECK (semaforo IN ('verde', 'amarelo', 'vermelho'))
);
CREATE TABLE IF NOT EXISTS comandos (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  criado_em TEXT NOT NULL,
  tipo      TEXT NOT NULL CHECK (tipo IN ('comando', 'arquivo')),
  alvo      TEXT NOT NULL,
  regra     TEXT,
  semaforo  TEXT NOT NULL CHECK (semaforo IN ('liberado', 'segurado'))
);
CREATE INDEX IF NOT EXISTS prompts_recentes  ON prompts  (criado_em DESC, id DESC);
CREATE INDEX IF NOT EXISTS comandos_recentes ON comandos (criado_em DESC, id DESC);
`;

interface LinhaPrompt {
  id: number;
  texto: string;
  criado_em: string;
  tamanho: Tamanho;
  tamanho_pct: number;
  objetivo_pct: number;
  onde_pct: number;
  pronto_pct: number;
  foco_pct: number;
  nota: number;
  semaforo: Semaforo;
}

interface LinhaComando {
  id: number;
  criado_em: string;
  tipo: TipoAlvo;
  alvo: string;
  regra: string | null;
  semaforo: SemaforoSaida;
}

const paraPrompt = (l: LinhaPrompt): Prompt => ({
  id: l.id,
  texto: l.texto,
  criadoEm: l.criado_em,
  criterios: {
    tamanho: l.tamanho,
    tamanhoPct: l.tamanho_pct,
    objetivoPct: l.objetivo_pct,
    ondePct: l.onde_pct,
    prontoPct: l.pronto_pct,
    focoPct: l.foco_pct,
  },
  nota: l.nota,
  semaforo: l.semaforo,
});

const paraComando = (l: LinhaComando): Comando => ({
  id: l.id,
  criadoEm: l.criado_em,
  tipo: l.tipo,
  alvo: l.alvo,
  regra: l.regra,
  semaforo: l.semaforo,
});

export function inserirPrompt(db: Banco, p: NovoPrompt): Prompt {
  const semaforo = semaforoDaNota(p.nota);
  const r = db
    .prepare(
      `INSERT INTO prompts (texto, criado_em, tamanho, tamanho_pct, objetivo_pct, onde_pct, pronto_pct, foco_pct, nota, semaforo)
       VALUES (@texto, @criadoEm, @tamanho, @tamanhoPct, @objetivoPct, @ondePct, @prontoPct, @focoPct, @nota, @semaforo)`,
    )
    .run({ texto: p.texto, criadoEm: p.criadoEm, ...p.criterios, nota: p.nota, semaforo });
  return { ...p, id: Number(r.lastInsertRowid), semaforo };
}

export function inserirComando(db: Banco, c: NovoComando): Comando {
  const semaforo = semaforoDoComando(c.regra);
  const r = db
    .prepare(
      `INSERT INTO comandos (criado_em, tipo, alvo, regra, semaforo)
       VALUES (@criadoEm, @tipo, @alvo, @regra, @semaforo)`,
    )
    .run({ criadoEm: c.criadoEm, tipo: c.tipo, alvo: c.alvo, regra: c.regra, semaforo });
  return { ...c, id: Number(r.lastInsertRowid), semaforo };
}

export function lerPlacar(db: Banco): Placar {
  const linhas = db.prepare("SELECT semaforo, COUNT(*) AS n FROM prompts GROUP BY semaforo").all() as {
    semaforo: Semaforo;
    n: number;
  }[];
  const conta = (s: Semaforo) => linhas.find((l) => l.semaforo === s)?.n ?? 0;
  const { n: segurados } = db.prepare("SELECT COUNT(*) AS n FROM comandos WHERE semaforo = 'segurado'").get() as {
    n: number;
  };
  return { passaram: conta("verde"), perguntas: conta("amarelo"), barrados: conta("vermelho"), segurados };
}

export function lerFeed(db: Banco, limite = 50): Feed {
  const prompts = db
    .prepare("SELECT * FROM prompts ORDER BY criado_em DESC, id DESC LIMIT ?")
    .all(limite) as LinhaPrompt[];
  const comandos = db
    .prepare("SELECT * FROM comandos ORDER BY criado_em DESC, id DESC LIMIT ?")
    .all(limite) as LinhaComando[];
  return { prompts: prompts.map(paraPrompt), comandos: comandos.map(paraComando), placar: lerPlacar(db) };
}

function semearSeVazio(db: Banco, agora: number) {
  const { n } = db.prepare("SELECT (SELECT COUNT(*) FROM prompts) + (SELECT COUNT(*) FROM comandos) AS n").get() as {
    n: number;
  };
  if (n > 0) return;
  const quando = (minutos: number) => new Date(agora - minutos * 60_000).toISOString();
  db.transaction(() => {
    for (const e of exemplosPrompts) {
      inserirPrompt(db, {
        texto: e.texto,
        criterios: e.criterios,
        nota: calcularNota(e.criterios),
        criadoEm: quando(e.minutosAtras),
      });
    }
    for (const e of exemplosComandos) {
      inserirComando(db, { tipo: e.tipo, alvo: e.alvo, regra: e.regra, criadoEm: quando(e.minutosAtras) });
    }
  })();
}

/** Abre (ou cria) o banco, garante as tabelas e grava os exemplos se estiver vazio. */
export function abrirBanco(caminho: string, agora = Date.now()): Banco {
  const db = new Database(caminho);
  db.pragma("journal_mode = WAL");
  db.exec(ESQUEMA);
  semearSeVazio(db, agora);
  return db;
}

// Uma conexão só por processo; o globalThis sobrevive ao recarregamento do `next dev`.
const global = globalThis as typeof globalThis & { __crivoBanco?: Banco };

export function banco(): Banco {
  if (!global.__crivoBanco) {
    const caminho = process.env.CRIVO_DB ?? path.join(process.cwd(), "data", "crivo.db");
    if (caminho !== ":memory:") fs.mkdirSync(path.dirname(caminho), { recursive: true });
    global.__crivoBanco = abrirBanco(caminho);
  }
  return global.__crivoBanco;
}
