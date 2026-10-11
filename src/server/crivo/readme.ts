// Descrição do projeto tirada do README, para a Jev julgar o tamanho do pedido (veja projetos.ts).

/** Badges, imagens, HTML, tabelas, citações e listas: nada disso descreve o projeto. */
const IGNORAR = /^(<|!\[|\[!\[|\||>|[-*+] |\d+[.)] )/;
const HEADING = /^#{1,6}\s/;
const CERCA = /^(`{3,}|~{3,})/;
const LINK = /\[([^\]]+)\]\([^)]+\)/g;
const ENFASE = /\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`/g;

/** README de template (create-next-app, Vite...) não diz nada do projeto. */
const TEMPLATES = ["bootstrapped with", "this template provides", "create-next-app", "create-react-app", "getting started"];

const ehTemplate = (texto: string) => TEMPLATES.some((t) => texto.toLowerCase().includes(t));

const limpar = (texto: string) => texto.replace(LINK, "$1").replace(ENFASE, "$1$2$3").replace(/\s+/g, " ").trim();

function cortar(texto: string, limite: number): string {
  if (texto.length <= limite) return texto;
  const espaco = texto.slice(0, limite).lastIndexOf(" ");
  return `${texto.slice(0, espaco > 0 ? espaco : limite - 1)}…`;
}

function semFrontmatter(linhas: string[]): string[] {
  if (linhas[0]?.trim() !== "---") return linhas;
  const fim = linhas.indexOf("---", 1);
  return fim === -1 ? linhas : linhas.slice(fim + 1);
}

/** Descrição curta do projeto tirada do README: "Título: primeiro parágrafo". Nulo se não houver parágrafo útil. */
export function resumoDoReadme(markdown: string, limite = 300): string | null {
  const linhas = semFrontmatter(markdown.replace(/\r\n/g, "\n").split("\n").map((l) => l.trim()));
  let titulo: string | null = null;
  const paragrafo: string[] = [];
  let cerca: string | null = null;

  for (const linha of linhas) {
    if (cerca) {
      if (linha.startsWith(cerca)) cerca = null;
      continue;
    }
    const abre = CERCA.exec(linha);
    if (abre) {
      if (paragrafo.length) break;
      cerca = abre[1];
      continue;
    }
    if (HEADING.test(linha)) {
      if (paragrafo.length) break;
      if (titulo === null && linha.startsWith("# ")) titulo = limpar(linha.slice(2));
      continue;
    }
    if (linha === "" || IGNORAR.test(linha)) {
      if (paragrafo.length) break;
      continue;
    }
    paragrafo.push(linha);
  }

  if (!paragrafo.length) return null;
  const texto = limpar(paragrafo.join(" "));
  if (ehTemplate(texto) || (titulo && ehTemplate(titulo))) return null;
  return cortar(titulo ? `${titulo}: ${texto}` : texto, limite);
}
