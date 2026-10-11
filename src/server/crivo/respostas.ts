import "server-only";
import { decidir } from "./decisao";
import { lerGanchoFerramenta, lerGanchoPrompt } from "./ganchos";
import { avaliarComJev } from "./jev";
import { descricaoDoProjeto } from "./projetos";
import {
  atualizarProjeto,
  claudePerguntou,
  inserirComando,
  inserirPrompt,
  lerFeed,
  lerProjeto,
  lerProjetos,
  registrarProjeto,
  ultimoSinal,
  type LinhaProjeto,
} from "./store";
import type { Avaliador, Decisao, Feed, ProjetoCrivo } from "./tipos";

/** Monta o avaliador da Jev com a descrição do projeto de onde veio o prompt. Os testes injetam outro. */
export type FabricaAvaliador = (descricaoProjeto: string) => Avaliador;

export const avaliadorJev: FabricaAvaliador = (projeto) => (texto) => avaliarComJev(texto, { projeto });

/** Descrição à mão no máximo deste tamanho: a Jev só precisa de uma ou duas frases. */
export const MAX_DESCRICAO = 300;

function paraProjeto(l: LinhaProjeto & { prompts: number }): ProjetoCrivo {
  const { texto, fonte } = descricaoDoProjeto(l.origem, l.cwd, l.descricao);
  return { origem: l.origem, cwd: l.cwd, descricao: texto, fonte, desligado: l.desligado, vistoEm: l.vistoEm, prompts: l.prompts };
}

/** O que a aba Crivo recebe (GET /api/crivo?origem=). */
export function montarFeed(origem: string | null = null): Feed {
  return {
    origem,
    projetos: lerProjetos().map(paraProjeto),
    ...lerFeed(50, origem),
    ultimoSinal: ultimoSinal(),
    jevLigada: Boolean(process.env.TYPESAFE_API_KEY?.trim()),
  };
}

/**
 * Registra o gancho no projeto. Com o banco fora do ar não há como saber se ele está desligado:
 * segue ligado, com a descrição automática.
 */
function projetoDoGancho(origem: string, cwd: string, ts: number): LinhaProjeto {
  try {
    return registrarProjeto(origem, cwd, ts);
  } catch (erro) {
    console.error("[crivo] falha ao registrar o projeto", erro);
    return { origem, cwd, descricao: null, desligado: false, vistoEm: ts };
  }
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
  const { cwd, ...prompt } = pacote;
  const projeto = projetoDoGancho(prompt.origem, cwd, prompt.ts);
  if (projeto.desligado) return Response.json({});
  const descricao = descricaoDoProjeto(projeto.origem, cwd, projeto.descricao).texto;
  const decidido = await decidir(prompt.texto, avaliadorPara(descricao), { respondendo: respondendo(prompt.sessao) });
  // Se o curl já desistiu, o prompt passou: gravar a cor do Jev mentiria no painel.
  const atrasou = req.signal.aborted || performance.now() - chegada > limiteMs;
  const d: Decisao = atrasou ? { ...decidido, ...DESISTIU } : decidido;
  try {
    inserirPrompt({
      ...prompt,
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

/** Corpo do POST /api/crivo/avaliar: a área de teste. Não grava nada; julga como o gancho julgaria naquele projeto. */
export async function respostaAvaliar(req: Request, avaliadorPara: FabricaAvaliador = avaliadorJev): Promise<Response> {
  const corpo = await lerCorpo(req);
  const texto = campoTexto(corpo, "texto");
  if (!texto) return Response.json({ erro: "Escreva um prompt para avaliar." }, { status: 400 });
  const origem = campoTexto(corpo, "origem")?.trim() ?? null;
  const projeto = origem ? lerProjeto(origem) : null;
  const descricao = origem ? descricaoDoProjeto(origem, projeto?.cwd ?? null, projeto?.descricao ?? null).texto : "um projeto de software";
  return Response.json(await decidir(texto, avaliadorPara(descricao)));
}

/** Corpo do POST /api/crivo/projetos: `{ origem, descricao?: string | null, desligado?: boolean }`. */
export async function respostaProjeto(req: Request): Promise<Response> {
  const corpo = await lerCorpo(req);
  const origem = campoTexto(corpo, "origem");
  if (!origem) return Response.json({ erro: "Diga qual projeto mudar." }, { status: 400 });
  const c = corpo as Record<string, unknown>;
  const mudanca: { descricao?: string | null; desligado?: boolean } = {};
  if ("descricao" in c) {
    if (c.descricao !== null && typeof c.descricao !== "string") return Response.json({ erro: "A descrição precisa ser texto." }, { status: 400 });
    const d = typeof c.descricao === "string" ? c.descricao.replace(/\s+/g, " ").trim() : "";
    if (d.length > MAX_DESCRICAO) return Response.json({ erro: `A descrição passa de ${MAX_DESCRICAO} caracteres.` }, { status: 400 });
    mudanca.descricao = d || null;
  }
  if ("desligado" in c) {
    if (typeof c.desligado !== "boolean") return Response.json({ erro: "desligado precisa ser true ou false." }, { status: 400 });
    mudanca.desligado = c.desligado;
  }
  if (!atualizarProjeto(origem, mudanca)) return Response.json({ erro: `O Crivo ainda não viu o projeto ${origem}.` }, { status: 404 });
  const atualizado = lerProjetos().find((p) => p.origem === origem);
  return Response.json(atualizado ? paraProjeto(atualizado) : {});
}

/** Corpo do POST /api/crivo/hooks/tool (PreToolUse). */
export async function respostaGanchoFerramenta(req: Request): Promise<Response> {
  const pacote = lerGanchoFerramenta(await lerCorpo(req));
  if (pacote === "ignorar") return Response.json({});
  if (!pacote) return recusar("pacote de ferramenta inválido");
  const { cwd, ...novo } = pacote;
  if (projetoDoGancho(novo.origem, cwd, novo.ts).desligado) return Response.json({});
  try {
    inserirComando(novo);
    return Response.json({});
  } catch (erro) {
    console.error("[crivo] falha ao registrar o comando", erro);
    return Response.json({ erro: "Não foi possível registrar o comando." }, { status: 500 });
  }
}
