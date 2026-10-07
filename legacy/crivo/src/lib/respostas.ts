import { lerConexao, registrarSinal } from "./conexao";
import { banco, inserirComando, inserirPrompt, lerFeed } from "./db";
import { lerGanchoFerramenta, lerGanchoPrompt } from "./ganchos";
import type { Feed } from "./tipos";

/** O que a tela recebe: banco + estado da conexão com o projeto. */
export function montarFeed(): Feed {
  return { ...lerFeed(banco()), conexao: lerConexao() };
}

/** Corpo do GET /api/feed. */
export function respostaFeed(): Response {
  try {
    return Response.json(montarFeed());
  } catch (erro) {
    console.error("[crivo] falha ao ler o feed", erro);
    return Response.json({ erro: "Não foi possível ler o feed." }, { status: 500 });
  }
}

async function lerCorpo(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

function recusar(motivo: string): Response {
  console.warn(`[crivo] gancho recusado: ${motivo}`);
  return Response.json({ erro: motivo }, { status: 400 });
}

// Resposta {} = "pode seguir". Nesta etapa o gancho descarta a resposta de qualquer jeito.

/** Corpo do POST /api/ganchos/prompt (UserPromptSubmit). */
export async function respostaGanchoPrompt(req: Request): Promise<Response> {
  const novo = lerGanchoPrompt(await lerCorpo(req));
  if (!novo) return recusar("pacote de prompt inválido");
  try {
    inserirPrompt(banco(), novo);
    registrarSinal("prompt", novo.criadoEm);
    return Response.json({});
  } catch (erro) {
    console.error("[crivo] falha ao registrar o prompt", erro);
    return Response.json({ erro: "Não foi possível registrar o prompt." }, { status: 500 });
  }
}

/** Corpo do POST /api/ganchos/ferramenta (PreToolUse). */
export async function respostaGanchoFerramenta(req: Request): Promise<Response> {
  const novo = lerGanchoFerramenta(await lerCorpo(req));
  if (novo === "ignorar") return Response.json({});
  if (!novo) return recusar("pacote de ferramenta inválido");
  try {
    inserirComando(banco(), novo);
    registrarSinal("ferramenta", novo.criadoEm);
    return Response.json({});
  } catch (erro) {
    console.error("[crivo] falha ao registrar o comando", erro);
    return Response.json({ erro: "Não foi possível registrar o comando." }, { status: 500 });
  }
}
