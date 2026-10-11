/** O que a Jev precisa saber do projeto para julgar o tamanho do pedido. A chave é a última pasta do cwd. */
const DESCRICOES: Record<string, string> = {
  "happy-team-chat": "happy-team-chat: um chat de WhatsApp para equipes",
};

export function descricaoDoProjeto(origem: string): string {
  return Object.hasOwn(DESCRICOES, origem) ? DESCRICOES[origem] : origem;
}
