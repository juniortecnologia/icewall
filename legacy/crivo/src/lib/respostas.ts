import { banco, lerFeed } from "./db";

/** Corpo do GET /api/feed. */
export function respostaFeed(): Response {
  try {
    return Response.json(lerFeed(banco()));
  } catch (erro) {
    console.error("[crivo] falha ao ler o feed", erro);
    return Response.json({ erro: "Não foi possível ler o feed." }, { status: 500 });
  }
}
