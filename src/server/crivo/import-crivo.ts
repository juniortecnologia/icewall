// Importa, uma única vez, o crivo.db (esquema v4) para as tabelas crivo_* do banco do ICEWALL.
// Uso: node scripts/import-crivo.ts [crivo.db] [icewall.db]   (com o serviço icewall parado)
import Database from "better-sqlite3";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

interface LinhaPrompt {
  id: number;
  texto: string;
  criado_em: string;
  origem: string;
  sessao: string | null;
  tamanho: string | null;
  tamanho_pct: number | null;
  objetivo_pct: number | null;
  onde_pct: number | null;
  pronto_pct: number | null;
  foco_pct: number | null;
  nota: number | null;
  semaforo: string;
  avaliacao: string | null;
  duracao_ms: number | null;
  faltando: string | null;
  motivo: string | null;
}

interface LinhaComando {
  id: number;
  criado_em: string;
  origem: string;
  sessao: string | null;
  tipo: string;
  alvo: string;
  regra: string | null;
  semaforo: string;
}

function emMs(iso: string): number {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) throw new Error(`horário ilegível no crivo.db: "${iso}"`);
  return ts;
}

const contar = (db: Database.Database, tabela: string) => (db.prepare(`SELECT count(*) AS n FROM ${tabela}`).get() as { n: number }).n;

export function importarCrivo(origem: Database.Database, destino: Database.Database): { prompts: number; comandos: number } {
  const versao = origem.pragma("user_version", { simple: true });
  if (versao !== 4) throw new Error(`crivo.db na versão ${versao}: o importador só lê a versão 4`);

  const tabelas = new Set(
    (destino.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name),
  );
  if (!tabelas.has("crivo_prompts") || !tabelas.has("crivo_comandos")) {
    throw new Error("o banco do ICEWALL não tem as tabelas crivo_prompts/crivo_comandos: suba o ICEWALL uma vez para aplicar as migrações");
  }
  if (contar(destino, "crivo_prompts") > 0 || contar(destino, "crivo_comandos") > 0) {
    throw new Error("o ICEWALL já tem dados do Crivo: nada foi importado");
  }

  const prompts = origem.prepare("SELECT * FROM prompts ORDER BY id").all() as LinhaPrompt[];
  const comandos = origem.prepare("SELECT * FROM comandos ORDER BY id").all() as LinhaComando[];
  const inserirPrompt = destino.prepare(
    `INSERT INTO crivo_prompts (id, ts, texto, origem, sessao, tamanho, tamanho_pct, objetivo_pct, onde_pct, pronto_pct, foco_pct,
       nota, semaforo, avaliacao, duracao_ms, faltando, motivo)
     VALUES (@id, @ts, @texto, @origem, @sessao, @tamanho, @tamanho_pct, @objetivo_pct, @onde_pct, @pronto_pct, @foco_pct,
       @nota, @semaforo, @avaliacao, @duracao_ms, @faltando, @motivo)`,
  );
  const inserirComando = destino.prepare(
    `INSERT INTO crivo_comandos (id, ts, origem, sessao, tipo, alvo, regra, semaforo)
     VALUES (@id, @ts, @origem, @sessao, @tipo, @alvo, @regra, @semaforo)`,
  );

  // Uma transação só: um horário ilegível desfaz tudo.
  destino.transaction(() => {
    for (const { criado_em, ...p } of prompts) inserirPrompt.run({ ...p, ts: emMs(criado_em) });
    for (const { criado_em, ...c } of comandos) inserirComando.run({ ...c, ts: emMs(criado_em) });
  })();
  return { prompts: prompts.length, comandos: comandos.length };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const caminhoOrigem = process.argv[2] ?? path.join(os.homedir(), "Backups", "crivo-2026-10-10", "crivo.db");
  const caminhoDestino = process.argv[3] ?? path.join(process.cwd(), "data", "icewall.db");
  let origem: Database.Database | undefined;
  let destino: Database.Database | undefined;
  try {
    origem = new Database(caminhoOrigem, { readonly: true, fileMustExist: true });
    destino = new Database(caminhoDestino, { fileMustExist: true });
    destino.pragma("busy_timeout = 5000");
    const r = importarCrivo(origem, destino);
    console.log(`importados: ${r.prompts} prompts, ${r.comandos} comandos`);
  } catch (erro) {
    process.stderr.write(`erro: ${erro instanceof Error ? erro.message : String(erro)}\n`);
    process.exitCode = 1;
  } finally {
    origem?.close();
    destino?.close();
  }
}
