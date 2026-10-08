import { lerConexao, registrarSinal } from "./conexao";
import { banco, inserirComando, inserirPrompt, lerFeed } from "./db";
import { decidir } from "./decisao";
import { lerGanchoFerramenta, lerGanchoPrompt } from "./ganchos";
import { avaliarComJev } from "./jev";
import type { Avaliador, Decisao, Feed } from "./tipos";

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

// Resposta {} = "pode seguir". O gancho de prompt usa `curl -sf`: o corpo da resposta 200 vira a saída do hook.

/** O gancho usa `curl -m 10`: resposta mais lenta que isto o Claude Code já não lê. */
export const LIMITE_GANCHO_MS = 9000;

const DESISTIU: Pick<Decisao, "semaforo" | "nota" | "criterios" | "faltando" | "avaliacao" | "motivo" | "saidaGancho"> = {
  semaforo: "verde",
  nota: null,
  criterios: null,
  faltando: null,
  avaliacao: "falhou",
  motivo: "o Crivo demorou mais que o gancho espera e o prompt passou",
  saidaGancho: {},
};

/** Corpo do POST /api/ganchos/prompt (UserPromptSubmit). */
export async function respostaGanchoPrompt(
  req: Request,
  avaliar: Avaliador = avaliarComJev,
  limiteMs = LIMITE_GANCHO_MS,
): Promise<Response> {
  const chegada = performance.now();
  const pacote = lerGanchoPrompt(await lerCorpo(req));
  if (!pacote) return recusar("pacote de prompt inválido");
  const decidido = await decidir(pacote.texto, avaliar);
  // Se o curl já desistiu, o prompt passou: gravar a cor do Jev mentiria no painel.
  const atrasou = req.signal.aborted || performance.now() - chegada > limiteMs;
  const d: Decisao = atrasou ? { ...decidido, ...DESISTIU } : decidido;
  try {
    inserirPrompt(banco(), {
      ...pacote,
      criterios: d.criterios,
      nota: d.nota,
      semaforo: d.semaforo,
      avaliacao: d.avaliacao,
      duracaoMs: d.duracaoMs,
      faltando: d.faltando,
      motivo: d.motivo,
    });
    registrarSinal("prompt", pacote.criadoEm);
    return Response.json(d.saidaGancho);
  } catch (erro) {
    // Sem registro não há bloqueio: o 500 faz o curl -f calar e o prompt segue.
    console.error("[crivo] falha ao registrar o prompt", erro);
    return Response.json({ erro: "Não foi possível registrar o prompt." }, { status: 500 });
  }
}

/** Corpo do POST /api/avaliar: a área de teste. Não grava e não acende o "conectado". */
export async function respostaAvaliar(req: Request, avaliar: Avaliador = avaliarComJev): Promise<Response> {
  const corpo = await lerCorpo(req);
  const texto =
    typeof corpo === "object" && corpo !== null && "texto" in corpo && typeof corpo.texto === "string" && corpo.texto.trim()
      ? corpo.texto
      : null;
  if (!texto) return Response.json({ erro: "Escreva um prompt para avaliar." }, { status: 400 });
  return Response.json(await decidir(texto, avaliar));
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
