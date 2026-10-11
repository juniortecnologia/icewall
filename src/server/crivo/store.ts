import "server-only";
import { and, desc, eq, max, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "../db/client";
import { semaforoDoComando } from "./avaliacao";
import type { Comando, Criterios, NovoComando, NovoPrompt, Placar, Prompt } from "./tipos";

// Leitura e escrita do Crivo no banco do ICEWALL (tabelas crivo_prompts e crivo_comandos).

const P = schema.crivoPrompts;
const C = schema.crivoComandos;
const J = schema.crivoProjetos;

type LinhaPrompt = typeof P.$inferSelect;

function paraPrompt(l: LinhaPrompt): Prompt {
  const criterios: Criterios | null =
    l.tamanho === null
      ? null
      : {
          tamanho: l.tamanho,
          tamanhoPct: l.tamanhoPct ?? 0,
          objetivoPct: l.objetivoPct ?? 0,
          ondePct: l.ondePct ?? 0,
          prontoPct: l.prontoPct ?? 0,
          focoPct: l.focoPct ?? 0,
        };
  return {
    id: l.id,
    texto: l.texto,
    ts: l.ts,
    origem: l.origem,
    sessao: l.sessao,
    criterios,
    nota: l.nota,
    semaforo: l.semaforo,
    avaliacao: l.avaliacao,
    duracaoMs: l.duracaoMs,
    faltando: l.faltando ?? null,
    motivo: l.motivo,
    tokens: l.jevInputTokens === null ? null : { entrada: l.jevInputTokens, saida: l.jevOutputTokens ?? 0 },
  };
}

export function inserirPrompt(p: NovoPrompt): Prompt {
  const c = p.criterios;
  const linha = getDb()
    .insert(P)
    .values({
      ts: p.ts,
      texto: p.texto,
      origem: p.origem,
      sessao: p.sessao,
      tamanho: c?.tamanho ?? null,
      tamanhoPct: c?.tamanhoPct ?? null,
      objetivoPct: c?.objetivoPct ?? null,
      ondePct: c?.ondePct ?? null,
      prontoPct: c?.prontoPct ?? null,
      focoPct: c?.focoPct ?? null,
      nota: p.nota,
      semaforo: p.semaforo,
      avaliacao: p.avaliacao,
      duracaoMs: p.duracaoMs,
      faltando: p.faltando,
      motivo: p.motivo,
      jevInputTokens: p.tokens?.entrada ?? null,
      jevOutputTokens: p.tokens?.saida ?? null,
    })
    .returning()
    .get();
  return paraPrompt(linha);
}

export function inserirComando(c: NovoComando): Comando {
  return getDb()
    .insert(C)
    .values({ ...c, semaforo: semaforoDoComando(c.regra) })
    .returning()
    .get();
}

export function lerPlacar(origem: string | null = null): Placar {
  const db = getDb();
  const p = db
    .select({
      passaram: sql<number>`coalesce(sum(${P.semaforo} = 'verde'), 0)`,
      perguntas: sql<number>`coalesce(sum(${P.semaforo} = 'amarelo'), 0)`,
      barrados: sql<number>`coalesce(sum(${P.semaforo} = 'vermelho'), 0)`,
    })
    .from(P)
    .where(origem === null ? undefined : eq(P.origem, origem))
    .get();
  const c = db
    .select({ segurados: sql<number>`coalesce(sum(${C.semaforo} = 'segurado'), 0)` })
    .from(C)
    .where(origem === null ? undefined : eq(C.origem, origem))
    .get();
  return { passaram: p?.passaram ?? 0, perguntas: p?.perguntas ?? 0, barrados: p?.barrados ?? 0, segurados: c?.segurados ?? 0 };
}

/** Mais novos primeiro; `origem` nula = todos os projetos. */
export function lerFeed(limite = 50, origem: string | null = null): { prompts: Prompt[]; comandos: Comando[]; placar: Placar } {
  const db = getDb();
  const doP: SQL | undefined = origem === null ? undefined : eq(P.origem, origem);
  const doC: SQL | undefined = origem === null ? undefined : eq(C.origem, origem);
  return {
    prompts: db.select().from(P).where(doP).orderBy(desc(P.ts), desc(P.id)).limit(limite).all().map(paraPrompt),
    comandos: db.select().from(C).where(doC).orderBy(desc(C.ts), desc(C.id)).limit(limite).all(),
    placar: lerPlacar(origem),
  };
}

/**
 * O último prompt da sessão virou pergunta da Jev (amarelo): o próximo é a resposta do usuário ao Claude.
 * Notificações do Claude Code no meio do caminho não contam.
 */
export function claudePerguntou(sessao: string): boolean {
  const ultimo = getDb()
    .select({ semaforo: P.semaforo, avaliacao: P.avaliacao })
    .from(P)
    .where(and(eq(P.sessao, sessao), sql`coalesce(${P.avaliacao}, '') <> 'notificacao'`))
    .orderBy(desc(P.id))
    .limit(1)
    .get();
  return ultimo?.semaforo === "amarelo" && ultimo.avaliacao === "jev";
}

/** Último gancho recebido, de qualquer portão. */
export function ultimoSinal(): number | null {
  const db = getDb();
  const p = db.select({ ts: max(P.ts) }).from(P).get()?.ts ?? null;
  const c = db.select({ ts: max(C.ts) }).from(C).get()?.ts ?? null;
  return p === null ? c : c === null ? p : Math.max(p, c);
}

/** Custo da Jev no Crivo, para o Auditor. */
export function custoJev(): { n: number; entrada: number; saida: number } {
  const r = getDb()
    .select({
      n: sql<number>`count(*)`,
      entrada: sql<number>`coalesce(sum(${P.jevInputTokens}), 0)`,
      saida: sql<number>`coalesce(sum(${P.jevOutputTokens}), 0)`,
    })
    .from(P)
    .where(and(eq(P.avaliacao, "jev"), sql`${P.jevInputTokens} is not null`))
    .get();
  return { n: r?.n ?? 0, entrada: r?.entrada ?? 0, saida: r?.saida ?? 0 };
}

export type LinhaProjeto = typeof J.$inferSelect;

/** Cada gancho atualiza o cwd e a hora do projeto (e o cria na primeira vez). */
export function registrarProjeto(origem: string, cwd: string, ts: number): LinhaProjeto {
  return getDb()
    .insert(J)
    .values({ origem, cwd, vistoEm: ts })
    .onConflictDoUpdate({ target: J.origem, set: { cwd, vistoEm: ts } })
    .returning()
    .get();
}

export function lerProjeto(origem: string): LinhaProjeto | null {
  return getDb().select().from(J).where(eq(J.origem, origem)).get() ?? null;
}

/** Mais recentes primeiro, com quantos prompts cada um mandou. */
export function lerProjetos(): (LinhaProjeto & { prompts: number })[] {
  const db = getDb();
  const contagem = new Map(
    db
      .select({ origem: P.origem, n: sql<number>`count(*)` })
      .from(P)
      .groupBy(P.origem)
      .all()
      .map((r) => [r.origem, r.n]),
  );
  return db
    .select()
    .from(J)
    .orderBy(desc(J.vistoEm))
    .all()
    .map((l) => ({ ...l, prompts: contagem.get(l.origem) ?? 0 }));
}

/** `descricao: null` volta para a automática. Nulo = projeto desconhecido. */
export function atualizarProjeto(origem: string, mudanca: { descricao?: string | null; desligado?: boolean }): LinhaProjeto | null {
  if (mudanca.descricao === undefined && mudanca.desligado === undefined) return lerProjeto(origem);
  return getDb().update(J).set(mudanca).where(eq(J.origem, origem)).returning().get() ?? null;
}
