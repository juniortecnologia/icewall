import "server-only";
import { createHash } from "node:crypto";
import { TypeSafeClient, type EntryType, type Questions, type SystemOneResult } from "@typesafe-ai/sdk";
import { and, eq, isNotNull } from "drizzle-orm";
import { getDb, schema } from "../db/client";

export const JEV_MODEL = process.env.TYPESAFE_DEFAULT_MODEL ?? "jev-latest";

export function jevEnabled(): boolean {
  return Boolean(process.env.TYPESAFE_API_KEY?.trim());
}

let client: TypeSafeClient | null = null;
function getClient(): TypeSafeClient {
  client ??= new TypeSafeClient({ defaultModel: JEV_MODEL, timeout: 20_000 });
  return client;
}

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\b(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*\S+/gi,
];

/** O estado sai para a API da TypeSafe: tira qualquer coisa com cara de credencial antes. */
export function redact<T>(value: T): T {
  const text = JSON.stringify(value);
  const clean = SECRET_PATTERNS.reduce((t, re) => t.replace(re, "[REDACTED]"), text);
  return JSON.parse(clean) as T;
}

export type Answers<Q extends Questions> = SystemOneResult<Q>["answers"];

/**
 * Faz uma requisição à Jev (todas as perguntas sobre o mesmo estado juntas) e grava em jev_judgments.
 * Mesmo estado + mesmas perguntas = resposta do cache, sem nova chamada.
 */
export async function judge<const Q extends Questions>(
  subjectKind: string,
  subjectId: string,
  state: EntryType,
  questions: Q,
): Promise<Answers<Q> | null> {
  if (!jevEnabled()) return null;
  const safeState = redact(state);
  const requestHash = createHash("sha256").update(JSON.stringify({ m: JEV_MODEL, s: safeState, q: questions })).digest("hex");
  const db = getDb();
  const cached = db
    .select()
    .from(schema.jevJudgments)
    .where(and(eq(schema.jevJudgments.requestHash, requestHash), isNotNull(schema.jevJudgments.answers)))
    .get();
  if (cached) return cached.answers as Answers<Q>;

  try {
    const res = await getClient().systemOne({ state: safeState, questions });
    db.insert(schema.jevJudgments)
      .values({
        subjectKind,
        subjectId,
        requestHash,
        model: res.model,
        answers: res.answers,
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
      })
      .run();
    return res.answers;
  } catch (err) {
    // Hash próprio para o erro: não bloqueia uma nova tentativa no próximo ciclo.
    db.insert(schema.jevJudgments)
      .values({ subjectKind, subjectId, requestHash: `${requestHash}:err:${Date.now()}`, error: String(err) })
      .run();
    return null;
  }
}

/** Já existe julgamento bem-sucedido para este assunto? */
export function isJudged(subjectKind: string, subjectId: string): boolean {
  return Boolean(
    getDb()
      .select({ id: schema.jevJudgments.id })
      .from(schema.jevJudgments)
      .where(
        and(
          eq(schema.jevJudgments.subjectKind, subjectKind),
          eq(schema.jevJudgments.subjectId, subjectId),
          isNotNull(schema.jevJudgments.answers),
        ),
      )
      .get(),
  );
}
