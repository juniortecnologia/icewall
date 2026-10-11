import { limitarPct } from "./avaliacao";
import type { Avaliador, Criterio, Criterios, Decisao, FalhaJev, RespostaJev, SaidaGancho, Semaforo } from "./tipos";

// O Jev só dá chances; quem decide a cor é este arquivo.

/** objetivo, onde e pronto faltam quando a chance fica abaixo disto. */
export const LIMITE_FALTA = 0.5;
/** mistura falta (o pedido junta várias tarefas) quando a chance passa disto. */
export const LIMITE_MISTURA = 0.6;
/** Até este número de palavras é resposta de conversa ("sim", "pode continuar"): passa sem o Jev. */
export const PALAVRAS_RESPOSTA_CURTA = 4;
/** Prompt que começa com isto passa direto, sem avaliação. */
export const MARCA_PRESSA = ">>";

export const ROTULO_FALTA: Record<Criterio, string> = {
  objetivo: "um objetivo claro (duas pessoas poderiam entender coisas diferentes)",
  onde: "em que tela ou parte do projeto mexer",
  pronto: "como saber que ficou pronto",
  mistura: "uma tarefa só (o pedido mistura várias)",
};

export const MENSAGEM_PRESSA = 'O ">>" no começo do prompt é só a marca de pressa do usuário para o Crivo; ignore.';

const MOTIVO_EXCECAO = "erro ao falar com a TypeSafe";

/** "a", "a e b", "a, b e c". */
export function juntarComE(itens: string[]): string {
  if (itens.length <= 1) return itens.join("");
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

const rotulos = (faltando: Criterio[]) => faltando.map((c) => ROTULO_FALTA[c]);

export function mensagemAviso(faltando: Criterio[]): string {
  return `Aviso do Crivo: neste pedido faltou ${juntarComE(rotulos(faltando))}. O usuário prefere que você pergunte isso antes de começar: faça as perguntas primeiro e só comece depois das respostas.`;
}

export function mensagemBloqueio(nota: number, faltando: Criterio[]): string {
  return `O Crivo barrou este prompt (nota ${nota}). Faltou: ${rotulos(faltando).join("; ")}. Reescreva incluindo isso, ou comece com >> para passar sem avaliação.`;
}

const contexto = (texto: string): SaidaGancho => ({
  hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: texto },
});

/** As regras que dispensam o Jev. */
export function triagem(texto: string): "pressa" | "curta" | null {
  const limpo = texto.trim();
  if (limpo.startsWith(MARCA_PRESSA)) return "pressa";
  if (limpo.split(/\s+/).length <= PALAVRAS_RESPOSTA_CURTA) return "curta";
  return null;
}

function decidirSemJev(tipo: "pressa" | "curta" | "resposta"): Decisao {
  return {
    semaforo: "verde",
    nota: null,
    criterios: null,
    faltando: null,
    avaliacao: tipo,
    motivo: null,
    duracaoMs: null,
    saidaGancho: tipo === "pressa" ? contexto(MENSAGEM_PRESSA) : {},
  };
}

function decidirFalha(f: FalhaJev): Decisao {
  return {
    semaforo: "verde",
    nota: null,
    criterios: null,
    faltando: null,
    avaliacao: "falhou",
    motivo: f.motivo,
    duracaoMs: f.duracaoMs,
    saidaGancho: {},
  };
}

export function decidirComJev(r: RespostaJev): Decisao {
  const todos: Criterio[] = [];
  if (r.objetivo < LIMITE_FALTA) todos.push("objetivo");
  if (r.onde < LIMITE_FALTA) todos.push("onde");
  if (r.pronto < LIMITE_FALTA) todos.push("pronto");
  if (r.mistura > LIMITE_MISTURA) todos.push("mistura");
  // Num ajuste pequeno só o objetivo conta; então ele nunca passa de amarelo.
  const faltando = r.tamanho === "ajuste" ? todos.filter((c) => c === "objetivo") : todos;
  const semaforo: Semaforo = faltando.length === 0 ? "verde" : faltando.length <= 2 ? "amarelo" : "vermelho";

  const nota = limitarPct((100 * (r.objetivo + r.onde + r.pronto + (1 - r.mistura))) / 4);
  const criterios: Criterios = {
    tamanho: r.tamanho,
    tamanhoPct: limitarPct(100 * (0.5 * r.probTamanho.funcionalidade + r.probTamanho.sistema)),
    objetivoPct: limitarPct(100 * r.objetivo),
    ondePct: limitarPct(100 * r.onde),
    prontoPct: limitarPct(100 * r.pronto),
    focoPct: limitarPct(100 * (1 - r.mistura)),
  };
  const saidaGancho: SaidaGancho =
    semaforo === "vermelho"
      ? { decision: "block", reason: mensagemBloqueio(nota, faltando) }
      : semaforo === "amarelo"
        ? contexto(mensagemAviso(faltando))
        : {};

  return { semaforo, nota, criterios, faltando, avaliacao: "jev", motivo: null, duracaoMs: r.duracaoMs, saidaGancho };
}

export interface Contexto {
  /** O último prompt da sessão virou pergunta: este é a resposta do usuário ao Claude. */
  respondendo: boolean;
}

/** A primeira regra que vale encerra: pressa, resposta curta, resposta ao Claude, falha do Jev, regras do Jev. */
export async function decidir(texto: string, avaliar: Avaliador, contexto: Contexto = { respondendo: false }): Promise<Decisao> {
  const tipo = triagem(texto);
  if (tipo) return decidirSemJev(tipo);
  if (contexto.respondendo) return decidirSemJev("resposta");
  let r: RespostaJev | FalhaJev;
  try {
    r = await avaliar(texto);
  } catch (erro) {
    console.error("[crivo] avaliador lançou exceção", erro);
    r = { ok: false, motivo: MOTIVO_EXCECAO, duracaoMs: 0 };
  }
  return r.ok ? decidirComJev(r) : decidirFalha(r);
}
