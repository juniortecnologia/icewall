import "server-only";
import { decidir } from "./decisao";
import { lerGanchoFerramenta, lerGanchoPrompt } from "./ganchos";
import { avaliarComJev } from "./jev";
import { descricaoDoProjeto } from "./projetos";
import { claudePerguntou, inserirComando, inserirPrompt, lerFeed, ultimoSinal } from "./store";
import type { Avaliador, Decisao, Feed } from "./tipos";

/** Monta o avaliador da Jev com a descrição do projeto de onde veio o prompt. Os testes injetam outro. */
export type FabricaAvaliador = (origem: string) => Avaliador;

export const avaliadorJev: FabricaAvaliador = (origem) => (texto) => avaliarComJev(texto, { projeto: descricaoDoProjeto(origem) });

/** Projeto usado na área de teste quando a tela não diz outro. */
export const ORIGEM_PADRAO = "happy-team-chat";

/** O que a aba Crivo recebe (GET /api/crivo). */
export function montarFeed(): Feed {
  return { ...lerFeed(), ultimoSinal: ultimoSinal(), jevLigada: Boolean(process.env.TYPESAFE_API_KEY?.trim()) };
}

async function lerCorpo(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

function campoTexto(corpo: unknown, nome: string): string | null {
  if (typeof corpo !== "object" || corpo === null) return null;
  const valor = (corpo as Record<string, unknown>)[nome];
  return typeof valor === "string" && valor.trim() ? valor : null;
}

function recusar(motivo: string): Response {
  console.warn(`[crivo] gancho recusado: ${motivo}`);
  return Response.json({ erro: motivo }, { status: 400 });
}

// Resposta {} = "pode seguir". O gancho de prompt usa `curl -sf`: o corpo da resposta 200 vira a saída do hook.

/** Sem sessão ou com o banco fora do ar, não há como saber: o prompt é avaliado normalmente. */
function respondendo(sessao: string | null): boolean {
  if (sessao === null) return false;
  try {
    return claudePerguntou(sessao);
  } catch (erro) {
    console.error("[crivo] falha ao ler o último prompt da sessão", erro);
    return false;
  }
}

/** O gancho usa `curl -m 10`: resposta mais lenta que isto o Claude Code já não lê. */
export const LIMITE_GANCHO_MS = 9000;

// Os tokens ficam: a Jev respondeu e cobrou, mesmo que tarde.
const DESISTIU: Pick<Decisao, "semaforo" | "nota" | "criterios" | "faltando" | "avaliacao" | "motivo" | "saidaGancho"> = {
  semaforo: "verde",
  nota: null,
  criterios: null,
  faltando: null,
  avaliacao: "falhou",
  motivo: "o Crivo demorou mais que o gancho espera e o prompt passou",
  saidaGancho: {},
};

/** Corpo do POST /api/crivo/hooks/prompt (UserPromptSubmit). */
export async function respostaGanchoPrompt(
  req: Request,
  avaliadorPara: FabricaAvaliador = avaliadorJev,
  limiteMs = LIMITE_GANCHO_MS,
): Promise<Response> {
  const chegada = performance.now();
  const pacote = lerGanchoPrompt(await lerCorpo(req));
  if (!pacote) return recusar("pacote de prompt inválido");
  const decidido = await decidir(pacote.texto, avaliadorPara(pacote.origem), { respondendo: respondendo(pacote.sessao) });
  // Se o curl já desistiu, o prompt passou: gravar a cor do Jev mentiria no painel.
  const atrasou = req.signal.aborted || performance.now() - chegada > limiteMs;
  const d: Decisao = atrasou ? { ...decidido, ...DESISTIU } : decidido;
  try {
    inserirPrompt({
      ...pacote,
      criterios: d.criterios,
      nota: d.nota,
      semaforo: d.semaforo,
      avaliacao: d.avaliacao,
      duracaoMs: d.duracaoMs,
      faltando: d.faltando,
      motivo: d.motivo,
      tokens: d.tokens,
    });
    return Response.json(d.saidaGancho);
  } catch (erro) {
    // Sem registro não há bloqueio: o 500 faz o curl -f calar e o prompt segue.
    console.error("[crivo] falha ao registrar o prompt", erro);
    return Response.json({ erro: "Não foi possível registrar o prompt." }, { status: 500 });
  }
}

/** Corpo do POST /api/crivo/avaliar: a área de teste. Não grava nada. */
export async function respostaAvaliar(req: Request, avaliadorPara: FabricaAvaliador = avaliadorJev): Promise<Response> {
  const corpo = await lerCorpo(req);
  const texto = campoTexto(corpo, "texto");
  if (!texto) return Response.json({ erro: "Escreva um prompt para avaliar." }, { status: 400 });
  return Response.json(await decidir(texto, avaliadorPara(campoTexto(corpo, "origem") ?? ORIGEM_PADRAO)));
}

/** Corpo do POST /api/crivo/hooks/tool (PreToolUse). */
export async function respostaGanchoFerramenta(req: Request): Promise<Response> {
  const novo = lerGanchoFerramenta(await lerCorpo(req));
  if (novo === "ignorar") return Response.json({});
  if (!novo) return recusar("pacote de ferramenta inválido");
  try {
    inserirComando(novo);
    return Response.json({});
  } catch (erro) {
    console.error("[crivo] falha ao registrar o comando", erro);
    return Response.json({ erro: "Não foi possível registrar o comando." }, { status: 500 });
  }
}
