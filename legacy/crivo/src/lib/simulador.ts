import { calcularNota, limitarPct } from "./avaliacao";
import { inserirComando, inserirPrompt, type Banco } from "./db";
import { REGRAS } from "./exemplos";
import type { Criterios, NovoComando, NovoPrompt, TipoAlvo } from "./tipos";

export type ItemSorteado = { tipo: "prompt"; dados: NovoPrompt } | { tipo: "comando"; dados: NovoComando };

const MODELOS_PROMPT: { texto: string; criterios: Criterios }[] = [
  { texto: "arruma isso", criterios: { tamanho: "ajuste", tamanhoPct: 20, objetivoPct: 5, ondePct: 0, prontoPct: 0, focoPct: 60 } },
  {
    texto: "faz o app ficar igual ao do concorrente",
    criterios: { tamanho: "sistema", tamanhoPct: 95, objetivoPct: 20, ondePct: 5, prontoPct: 5, focoPct: 30 },
  },
  {
    texto: "deixa o dashboard mais bonito e adiciona gráfico de vendas e exportação em PDF e muda o login",
    criterios: { tamanho: "sistema", tamanhoPct: 75, objetivoPct: 45, ondePct: 25, prontoPct: 10, focoPct: 10 },
  },
  {
    texto: "adiciona um campo CPF no cadastro de clientes com validação",
    criterios: { tamanho: "funcionalidade", tamanhoPct: 35, objetivoPct: 80, ondePct: 45, prontoPct: 35, focoPct: 95 },
  },
  {
    texto:
      "o filtro de data em src/app/pedidos/Filtros.tsx ignora o fuso; usa America/Sao_Paulo. Pronto quando o pedido das 23h30 aparecer no dia certo.",
    criterios: { tamanho: "ajuste", tamanhoPct: 15, objetivoPct: 95, ondePct: 100, prontoPct: 95, focoPct: 100 },
  },
  {
    texto:
      "cria um endpoint GET /api/clientes/:id/pedidos em src/app/api/clientes que devolve os 20 últimos pedidos do cliente, com teste de integração cobrindo cliente sem pedidos e cliente inexistente (404)",
    criterios: { tamanho: "funcionalidade", tamanhoPct: 40, objetivoPct: 90, ondePct: 95, prontoPct: 85, focoPct: 95 },
  },
  {
    texto:
      "ajusta o import em src/features/financeiro/relatorios/exportacao/geradores/planilha/ConfiguracaoDeColunasDoRelatorioMensalConsolidadoPorCentroDeCusto.tsx que quebrou depois da atualização do pacote",
    criterios: { tamanho: "ajuste", tamanhoPct: 10, objetivoPct: 75, ondePct: 100, prontoPct: 35, focoPct: 100 },
  },
  {
    texto: "migra o projeto todo para microserviços",
    criterios: { tamanho: "sistema", tamanhoPct: 100, objetivoPct: 35, ondePct: 15, prontoPct: 5, focoPct: 70 },
  },
];

const MODELOS_COMANDO: { tipo: TipoAlvo; alvo: string; regra: string | null }[] = [
  { tipo: "comando", alvo: "pnpm typecheck", regra: null },
  { tipo: "comando", alvo: "git diff --stat", regra: null },
  { tipo: "arquivo", alvo: "src/app/pedidos/Filtros.tsx", regra: null },
  { tipo: "arquivo", alvo: "tests/pedidos.test.ts", regra: null },
  { tipo: "comando", alvo: "rm -rf ~/Projects/app/.git", regra: REGRAS.rmRf },
  { tipo: "comando", alvo: "git push -f origin developer", regra: REGRAS.pushForce },
  { tipo: "arquivo", alvo: ".env.production", regra: REGRAS.env },
  { tipo: "comando", alvo: 'sqlite3 data/app.db "TRUNCATE pedidos"', regra: REGRAS.drop },
  { tipo: "comando", alvo: "pnpm add lodash axios dayjs", regra: REGRAS.pacote },
  { tipo: "comando", alvo: 'git commit --no-verify -m "wip"', regra: REGRAS.semTeste },
];

function escolher<T>(lista: readonly T[], rand: () => number): T {
  return lista[Math.min(lista.length - 1, Math.floor(rand() * lista.length))];
}

/** Mexe até 10 pontos para cima ou para baixo, para os itens não serem idênticos. */
const variar = (pct: number, rand: () => number) => limitarPct(pct + (rand() - 0.5) * 20);

export function sortearItem(rand: () => number = Math.random, agora: Date = new Date()): ItemSorteado {
  const criadoEm = agora.toISOString();
  if (rand() < 0.5) {
    const m = escolher(MODELOS_PROMPT, rand);
    const criterios: Criterios = {
      ...m.criterios,
      objetivoPct: variar(m.criterios.objetivoPct, rand),
      ondePct: variar(m.criterios.ondePct, rand),
      prontoPct: variar(m.criterios.prontoPct, rand),
      focoPct: variar(m.criterios.focoPct, rand),
    };
    return { tipo: "prompt", dados: { texto: m.texto, criadoEm, criterios, nota: calcularNota(criterios) } };
  }
  const m = escolher(MODELOS_COMANDO, rand);
  return { tipo: "comando", dados: { ...m, criadoEm } };
}

export function gravarItem(db: Banco, item: ItemSorteado): void {
  if (item.tipo === "prompt") inserirPrompt(db, item.dados);
  else inserirComando(db, item.dados);
}
