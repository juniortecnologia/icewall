import { connection } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { trainJobs } from "@/server/db/schema";
import { withAuth } from "@/server/auth/withAuth";
import { execOnServer } from "@/server/executor";
import { shellPath } from "@/server/spark/ssh";
import { parseTrainLog } from "@/server/train/parse-log";
import { safeTrainJob } from "../../schemas";

/**
 * Logs ao vivo de um job (SSE) — padrão Next 16: ReadableStream +
 * text/event-stream. A cada 2,5 s polla o train.log remoto (tail) e o estado
 * do job; encerra quando o job termina, o cliente desconecta ou após 30 min
 * (o cliente reconecta — EventSource reconstrói sozinho).
 */

type Ctx = { params: Promise<{ id: string }> };

const INTERVALO_MS = 2500;
const LIMITE_MS = 30 * 60_000;

async function stream(req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  const { id } = await ctx.params;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) {
    return new Response("id inválido", { status: 400 });
  }
  const job = getDb().select().from(trainJobs).where(eq(trainJobs.id, numId)).limit(1).get();
  if (!job) {
    return new Response("não encontrado", { status: 404 });
  }

  const encoder = new TextEncoder();
  const corpo = new ReadableStream({
    async start(controller) {
      const inicio = Date.now();
      const enviar = (dados: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(dados)}\n\n`));
      };
      try {
        while (!req.signal.aborted && Date.now() - inicio < LIMITE_MS) {
          const atual = getDb().select().from(trainJobs).where(eq(trainJobs.id, numId)).limit(1).get();
          if (!atual) break;
          const evento: Record<string, unknown> = { job: safeTrainJob(atual), log: "" };
          if (atual.workspacePath) {
            const res = await execOnServer(
              atual.serverId,
              `tail -n 80 ${shellPath(atual.workspacePath)}/train.log 2>/dev/null || true`,
              8_000,
            );
            evento.log = res.stdout;
            evento.marcadores = parseTrainLog(res.stdout);
          }
          enviar(evento);
          if (atual.status === "done" || atual.status === "failed" || atual.status === "cancelled") break;
          await new Promise((r) => setTimeout(r, INTERVALO_MS));
        }
      } catch {
        // stream interrompido (servidor remoto sumiu etc.): fecha limpo
      } finally {
        try {
          controller.close();
        } catch {
          // já fechado
        }
      }
    },
  });

  return new Response(corpo, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      connection: "keep-alive",
    },
  });
}

export const GET = (req: Request, ctx: Ctx): Promise<Response> => withAuth((authReq) => stream(authReq, ctx))(req);
