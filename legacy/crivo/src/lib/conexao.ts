import type { Conexao } from "./tipos";

// Só na memória: ao religar o Crivo, começa apagado de novo (decisão da etapa 2).
interface Estado {
  conectadoEm: string | null;
  ultimoSinal: string | null;
}

const global = globalThis as typeof globalThis & { __crivoConexao?: Estado };
const estado = (): Estado => (global.__crivoConexao ??= { conectadoEm: null, ultimoSinal: null });

/** Todo sinal atualiza o "último sinal"; só um prompt acende o "conectado". */
export function registrarSinal(tipo: "prompt" | "ferramenta", quando: string): void {
  const e = estado();
  e.ultimoSinal = quando;
  if (tipo === "prompt" && e.conectadoEm === null) e.conectadoEm = quando;
}

export function lerConexao(): Conexao {
  const e = estado();
  return { conectado: e.conectadoEm !== null, ultimoSinal: e.ultimoSinal };
}
