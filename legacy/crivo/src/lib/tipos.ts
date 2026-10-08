export type Semaforo = "verde" | "amarelo" | "vermelho";
export type Tamanho = "ajuste" | "funcionalidade" | "sistema";
export type TipoAlvo = "comando" | "arquivo";
export type SemaforoSaida = "liberado" | "segurado";

/** Os cinco critérios do portão de entrada, de 0 a 100. */
export interface Criterios {
  tamanho: Tamanho;
  /** Escala do tamanho: 0 = ajuste mínimo, 100 = sistema inteiro. */
  tamanhoPct: number;
  objetivoPct: number;
  ondePct: number;
  prontoPct: number;
  /** Foco num assunto só: baixo = mistura várias coisas. */
  focoPct: number;
}

export interface Prompt {
  id: number;
  texto: string;
  criadoEm: string;
  /** Nome do projeto de onde veio (última pasta do cwd do Claude Code). */
  origem: string;
  sessao: string | null;
  /** Nulos enquanto não houver avaliação (IA). */
  criterios: Criterios | null;
  nota: number | null;
  semaforo: Semaforo;
}

export interface Comando {
  id: number;
  criadoEm: string;
  origem: string;
  sessao: string | null;
  tipo: TipoAlvo;
  alvo: string;
  regra: string | null;
  semaforo: SemaforoSaida;
}

export interface Placar {
  passaram: number;
  perguntas: number;
  barrados: number;
  segurados: number;
}

export interface Conexao {
  conectado: boolean;
  ultimoSinal: string | null;
}

export interface Feed {
  prompts: Prompt[];
  comandos: Comando[];
  placar: Placar;
  conexao: Conexao;
}

export type FeedDoBanco = Omit<Feed, "conexao">;

export type NovoPrompt = Omit<Prompt, "id" | "semaforo">;
export type NovoComando = Omit<Comando, "id" | "semaforo">;

/** Os critérios que podem faltar num pedido, na ordem em que são listados. */
export type Criterio = "objetivo" | "onde" | "pronto" | "mistura";

/** Como o prompt foi tratado: pelo Jev, pela marca de pressa, por ser curto, ou o Jev falhou. */
export type Avaliacao = "jev" | "pressa" | "curta" | "falhou";

/** O que o Jev respondeu, em chances de 0 a 1. */
export interface RespostaJev {
  ok: true;
  tamanho: Tamanho;
  probTamanho: Record<Tamanho, number>;
  objetivo: number;
  onde: number;
  pronto: number;
  mistura: number;
  duracaoMs: number;
}

/** O Jev não respondeu: o prompt passa como "não avaliado". */
export interface FalhaJev {
  ok: false;
  motivo: string;
  duracaoMs: number;
}

export type Avaliador = (texto: string) => Promise<RespostaJev | FalhaJev>;

/** Saída do gancho UserPromptSubmit. Vazia = segue em silêncio. */
export interface SaidaGancho {
  decision?: "block";
  reason?: string;
  hookSpecificOutput?: { hookEventName: "UserPromptSubmit"; additionalContext: string };
}

export interface Decisao {
  semaforo: Semaforo;
  nota: number | null;
  criterios: Criterios | null;
  faltando: Criterio[] | null;
  avaliacao: Avaliacao;
  motivo: string | null;
  duracaoMs: number | null;
  saidaGancho: SaidaGancho;
}
