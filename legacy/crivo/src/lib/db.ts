import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { semaforoDoComando, semaforoDoPrompt } from "./avaliacao";
import type {
  Comando,
  FeedDoBanco,
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

/** v1 = etapa 1 (dados de mentira); v2 = dados reais vindos dos hooks. */
export const VERSAO_ESQUEMA = 2;

// CHECK com valor nulo passa: nota e critérios ficam vazios até a IA existir.
const ESQUEMA = `
CREATE TABLE IF NOT EXISTS prompts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  texto        TEXT    NOT NULL,
  criado_em    TEXT    NOT NULL,
  origem       TEXT    NOT NULL,
  sessao       TEXT,
  tamanho      TEXT    CHECK (tamanho IN ('ajuste', 'funcionalidade', 'sistema')),
  tamanho_pct  INTEGER CHECK (tamanho_pct  BETWEEN 0 AND 100),
  objetivo_pct INTEGER CHECK (objetivo_pct BETWEEN 0 AND 100),
  onde_pct     INTEGER CHECK (onde_pct     BETWEEN 0 AND 100),
  pronto_pct   INTEGER CHECK (pronto_pct   BETWEEN 0 AND 100),
  foco_pct     INTEGER CHECK (foco_pct     BETWEEN 0 AND 100),
  nota         INTEGER CHECK (nota         BETWEEN 0 AND 100),
  semaforo     TEXT    NOT NULL CHECK (semaforo IN ('verde', 'amarelo', 'vermelho'))
);
CREATE TABLE IF NOT EXISTS comandos (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  criado_em TEXT NOT NULL,
  origem    TEXT NOT NULL,
  sessao    TEXT,
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
  origem: string;
  sessao: string | null;
  tamanho: Tamanho | null;
  tamanho_pct: number | null;
  objetivo_pct: number | null;
  onde_pct: number | null;
  pronto_pct: number | null;
  foco_pct: number | null;
  nota: number | null;
  semaforo: Semaforo;
}

interface LinhaComando {
  id: number;
  criado_em: string;
  origem: string;
  sessao: string | null;
  tipo: TipoAlvo;
  alvo: string;
  regra: string | null;
  semaforo: SemaforoSaida;
}

const paraPrompt = (l: LinhaPrompt): Prompt => ({
  id: l.id,
  texto: l.texto,
  criadoEm: l.criado_em,
  origem: l.origem,
  sessao: l.sessao,
  criterios:
    l.tamanho === null
      ? null
      : {
          tamanho: l.tamanho,
          tamanhoPct: l.tamanho_pct ?? 0,
          objetivoPct: l.objetivo_pct ?? 0,
          ondePct: l.onde_pct ?? 0,
          prontoPct: l.pronto_pct ?? 0,
          focoPct: l.foco_pct ?? 0,
        },
  nota: l.nota,
  semaforo: l.semaforo,
});

const paraComando = (l: LinhaComando): Comando => ({
  id: l.id,
  criadoEm: l.criado_em,
  origem: l.origem,
  sessao: l.sessao,
  tipo: l.tipo,
  alvo: l.alvo,
  regra: l.regra,
  semaforo: l.semaforo,
});

export function inserirPrompt(db: Banco, p: NovoPrompt): Prompt {
  const semaforo = semaforoDoPrompt(p.nota);
  const c = p.criterios;
  const r = db
    .prepare(
      `INSERT INTO prompts (texto, criado_em, origem, sessao, tamanho, tamanho_pct, objetivo_pct, onde_pct, pronto_pct, foco_pct, nota, semaforo)
       VALUES (@texto, @criadoEm, @origem, @sessao, @tamanho, @tamanhoPct, @objetivoPct, @ondePct, @prontoPct, @focoPct, @nota, @semaforo)`,
    )
    .run({
      texto: p.texto,
      criadoEm: p.criadoEm,
      origem: p.origem,
      sessao: p.sessao,
      tamanho: c?.tamanho ?? null,
      tamanhoPct: c?.tamanhoPct ?? null,
      objetivoPct: c?.objetivoPct ?? null,
      ondePct: c?.ondePct ?? null,
      prontoPct: c?.prontoPct ?? null,
      focoPct: c?.focoPct ?? null,
      nota: p.nota,
      semaforo,
    });
  return { ...p, id: Number(r.lastInsertRowid), semaforo };
}

export function inserirComando(db: Banco, c: NovoComando): Comando {
  const semaforo = semaforoDoComando(c.regra);
  const r = db
    .prepare(
      `INSERT INTO comandos (criado_em, origem, sessao, tipo, alvo, regra, semaforo)
       VALUES (@criadoEm, @origem, @sessao, @tipo, @alvo, @regra, @semaforo)`,
    )
    .run({ criadoEm: c.criadoEm, origem: c.origem, sessao: c.sessao, tipo: c.tipo, alvo: c.alvo, regra: c.regra, semaforo });
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

export function lerFeed(db: Banco, limite = 50): FeedDoBanco {
  const prompts = db
    .prepare("SELECT * FROM prompts ORDER BY criado_em DESC, id DESC LIMIT ?")
    .all(limite) as LinhaPrompt[];
  const comandos = db
    .prepare("SELECT * FROM comandos ORDER BY criado_em DESC, id DESC LIMIT ?")
    .all(limite) as LinhaComando[];
  return { prompts: prompts.map(paraPrompt), comandos: comandos.map(paraComando), placar: lerPlacar(db) };
}

/**
 * Passos explícitos por versão. Só o passo da v1 apaga tabelas, porque a v1 tinha apenas
 * dados de mentira. Uma v3 futura precisa de um passo próprio que preserve os dados (ALTER).
 */
function migrar(db: Banco) {
  const versao = db.pragma("user_version", { simple: true }) as number;
  if (versao > VERSAO_ESQUEMA) {
    throw new Error(`Banco na versão ${versao}, mais nova que a deste Crivo (${VERSAO_ESQUEMA}). Atualize o Crivo.`);
  }
  db.transaction(() => {
    if (versao < 2) db.exec("DROP TABLE IF EXISTS prompts; DROP TABLE IF EXISTS comandos;");
    db.exec(ESQUEMA);
    db.pragma(`user_version = ${VERSAO_ESQUEMA}`);
  })();
}

/** Abre (ou cria) o banco e garante o esquema atual. */
export function abrirBanco(caminho: string): Banco {
  const db = new Database(caminho);
  db.pragma("journal_mode = WAL");
  migrar(db);
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
