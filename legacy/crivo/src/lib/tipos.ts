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
  criterios: Criterios;
  nota: number;
  semaforo: Semaforo;
}

export interface Comando {
  id: number;
  criadoEm: string;
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

export interface Feed {
  prompts: Prompt[];
  comandos: Comando[];
  placar: Placar;
}

export type NovoPrompt = Omit<Prompt, "id" | "semaforo">;
export type NovoComando = Omit<Comando, "id" | "semaforo">;
