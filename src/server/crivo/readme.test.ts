import { describe, expect, it } from "vitest";
import { resumoDoReadme } from "./readme";

describe("resumoDoReadme", () => {
  it("junta o título e o primeiro parágrafo", () => {
    const md = "# ICEWALL\n\nPainel de controle local do DGX Spark\ne dos modelos locais.\n\n## Rodar\n\nnpm start\n";
    expect(resumoDoReadme(md)).toBe("ICEWALL: Painel de controle local do DGX Spark e dos modelos locais.");
  });

  it("sem título, devolve só o parágrafo", () => {
    expect(resumoDoReadme("Um chat de WhatsApp para equipes.\n\nMais texto.")).toBe("Um chat de WhatsApp para equipes.");
  });

  it("pula frontmatter, badges, imagens, HTML, blocos de código, listas, tabelas e citações", () => {
    const md = [
      "---",
      "title: x",
      "---",
      "# Projeto",
      "[![build](https://x/badge.svg)](https://x)",
      "![logo](logo.png)",
      '<p align="center">logo</p>',
      "```bash",
      "npm run dev",
      "```",
      "~~~",
      "código",
      "~~~",
      "- item de lista",
      "1. passo",
      "| a | b |",
      "> citação",
      "",
      "O parágrafo de verdade.",
    ].join("\n");
    expect(resumoDoReadme(md)).toBe("Projeto: O parágrafo de verdade.");
  });

  it("limpa links e negrito e junta espaços", () => {
    const md = "Usa **Next.js** e [Drizzle](https://orm.drizzle.team)   com __SQLite__.";
    expect(resumoDoReadme(md)).toBe("Usa Next.js e Drizzle com SQLite.");
  });

  it("README de template não vira descrição", () => {
    expect(
      resumoDoReadme(
        "This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs).\n\n## Getting Started\n",
      ),
    ).toBeNull();
    expect(resumoDoReadme("# React + TypeScript + Vite\n\nThis template provides a minimal setup to get React working in Vite.\n")).toBeNull();
  });

  it("só título, ou vazio, devolve null", () => {
    expect(resumoDoReadme("# Projeto\n\n## Instalação\n\n```\nnpm i\n```\n")).toBeNull();
    expect(resumoDoReadme("")).toBeNull();
    expect(resumoDoReadme("   \n\n")).toBeNull();
  });

  it("corta no limite numa fronteira de palavra, com reticências", () => {
    const md = `# P\n\n${"palavra ".repeat(100)}`;
    const r = resumoDoReadme(md, 40);
    expect(r).not.toBeNull();
    expect(r!.length).toBeLessThanOrEqual(40);
    expect(r!.endsWith("…")).toBe(true);
    expect(r!.slice(0, -1).endsWith(" ")).toBe(false);
    expect(r!.startsWith("P: palavra palavra")).toBe(true);
  });

  it("linha horizontal --- no meio não é frontmatter", () => {
    expect(resumoDoReadme("# App\n\nFaz uma coisa.\n\n---\n\nRodapé.\n")).toBe("App: Faz uma coisa.");
  });

  it("lista colada ao parágrafo encerra o parágrafo", () => {
    expect(resumoDoReadme("Faz uma coisa:\n- item\n- outro\n")).toBe("Faz uma coisa:");
  });

  it("aceita CRLF", () => {
    expect(resumoDoReadme("# App\r\n\r\nFaz uma coisa.\r\n")).toBe("App: Faz uma coisa.");
  });
});
