import { APIError, APITimeoutError, TypeSafeClient, choice, noul, type Fetch } from "@typesafe-ai/sdk";
import type { FalhaJev, RespostaJev, Tamanho } from "./tipos";

// Único ponto do Crivo que fala com a TypeSafe. Só roda no servidor: a chave nunca sai daqui.
// Cliente próprio, sem o cache do auditor (src/server/jev/client.ts): o gancho espera no máximo
// 10 s e um prompt repetido deve ser avaliado de novo.

export const LIMITE_JEV_MS = 8000;
export const MAX_CARACTERES_JEV = 20_000;

export const PERGUNTAS = {
  tamanho: choice("Qual o tamanho do trabalho que o `pedido` pede, considerando o `projeto`?", {
    ajuste: "Ajuste pequeno: corrigir, trocar ou ajustar algo pontual que já existe (um texto, um botão, um bug).",
    funcionalidade: "Funcionalidade nova: uma tela, fluxo ou recurso novo dentro do projeto.",
    sistema: "Sistema inteiro: um módulo grande, várias telas ou uma reestruturação do projeto.",
  }),
  objetivo: noul("Duas pessoas diferentes, lendo o `pedido`, entenderiam a mesma coisa sobre o que deve ser feito?", {
    true: "O resultado esperado é específico e só admite uma leitura.",
    false: "É vago, ambíguo ou aberto a interpretações diferentes.",
  }),
  onde: noul("O `pedido` diz em que tela, arquivo ou parte do `projeto` mexer?", {
    true: "Nomeia a tela, o arquivo, o componente ou a área do projeto.",
    false: "Não diz onde a mudança acontece.",
  }),
  pronto: noul("O `pedido` diz como saber que ficou pronto: o que tem que aparecer, funcionar ou passar?", {
    true: "Descreve o resultado verificável ou o critério de aceite.",
    false: "Não diz como conferir que terminou.",
  }),
  mistura: noul("O `pedido` junta duas ou mais tarefas independentes, que poderiam ser pedidas separadamente?", {
    true: "Duas ou mais tarefas sem relação entre si no mesmo pedido.",
    false: "Uma tarefa só, mesmo que tenha vários passos.",
  }),
};

const TAMANHOS: readonly Tamanho[] = ["ajuste", "funcionalidade", "sistema"];

export interface OpcoesJev {
  /** Descrição do projeto (veja projetos.ts). */
  projeto: string;
  /** Padrão: TYPESAFE_API_KEY. */
  apiKey?: string;
  /** Padrão: TYPESAFE_DEFAULT_MODEL ou jev-latest, o mesmo do auditor. */
  modelo?: string;
  /** Para testes sem rede. */
  fetch?: Fetch;
  /** Padrão: LIMITE_JEV_MS. */
  timeoutMs?: number;
}

/** Chance de 0 a 1, ou erro: resposta fora do formato não pode virar NaN no banco. */
function chance(valor: unknown, campo: string): number {
  if (typeof valor !== "number" || !Number.isFinite(valor)) throw new Error(`resposta do Jev sem chance em "${campo}"`);
  return valor;
}

function motivoDoErro(erro: unknown): string {
  if (erro instanceof APITimeoutError) return `o Jev não respondeu em ${LIMITE_JEV_MS / 1000} s`;
  if (erro instanceof APIError) {
    if (erro.status === 401) return "TypeSafe recusou a chave";
    if (erro.status === 429) return "limite de uso da TypeSafe";
    if (erro.status >= 500) return "TypeSafe indisponível";
  }
  return "erro ao falar com a TypeSafe";
}

/** Faz as 5 perguntas numa chamada só. Nunca lança: toda falha vira FalhaJev. */
export async function avaliarComJev(texto: string, opcoes: OpcoesJev): Promise<RespostaJev | FalhaJev> {
  const apiKey = opcoes.apiKey ?? process.env.TYPESAFE_API_KEY;
  if (!apiKey?.trim()) return { ok: false, motivo: "sem chave TypeSafe", duracaoMs: 0 };

  const inicio = performance.now();
  const duracao = () => Math.round(performance.now() - inicio);
  try {
    const cliente = new TypeSafeClient({
      apiKey,
      defaultModel: opcoes.modelo ?? process.env.TYPESAFE_DEFAULT_MODEL ?? "jev-latest",
      fetch: opcoes.fetch,
      timeout: opcoes.timeoutMs ?? LIMITE_JEV_MS,
      retry: { maxRetries: 0 },
      logLevel: "off",
    });
    const { answers, usage } = await cliente.systemOne({
      state: { projeto: opcoes.projeto, pedido: texto.slice(0, MAX_CARACTERES_JEV) },
      questions: PERGUNTAS,
    });
    const tamanho = answers.tamanho.choice;
    if (!TAMANHOS.includes(tamanho)) throw new Error(`tamanho desconhecido do Jev: "${String(tamanho)}"`);
    const p = answers.tamanho.probabilities;
    return {
      ok: true,
      tamanho,
      probTamanho: {
        ajuste: chance(p.ajuste ?? 0, "ajuste"),
        funcionalidade: chance(p.funcionalidade ?? 0, "funcionalidade"),
        sistema: chance(p.sistema ?? 0, "sistema"),
      },
      objetivo: chance(answers.objetivo.noul, "objetivo"),
      onde: chance(answers.onde.noul, "onde"),
      pronto: chance(answers.pronto.noul, "pronto"),
      mistura: chance(answers.mistura.noul, "mistura"),
      duracaoMs: duracao(),
      tokens: usage ? { entrada: usage.input_tokens, saida: usage.output_tokens } : null,
    };
  } catch (erro) {
    const motivo = motivoDoErro(erro);
    // Só a mensagem do erro: os cabeçalhos (com a chave) nunca vão para o log.
    console.error(`[crivo] Jev falhou (${motivo}): ${erro instanceof Error ? erro.message : String(erro)}`);
    return { ok: false, motivo, duracaoMs: duracao() };
  }
}
