import { banco, lerFeed } from "./db";
import { gravarItem, sortearItem } from "./simulador";

/** Corpo do GET /api/feed. */
export function respostaFeed(): Response {
  try {
    return Response.json(lerFeed(banco()));
  } catch (erro) {
    console.error("[crivo] falha ao ler o feed", erro);
    return Response.json({ erro: "Não foi possível ler o feed." }, { status: 500 });
  }
}

/** Corpo do POST /api/simular. */
export function respostaSimular(): Response {
  try {
    const db = banco();
    gravarItem(db, sortearItem());
    return Response.json(lerFeed(db));
  } catch (erro) {
    console.error("[crivo] falha ao simular", erro);
    return Response.json({ erro: "Não foi possível simular." }, { status: 500 });
  }
}
