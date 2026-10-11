import "server-only";
import fs from "node:fs";
import path from "node:path";
import { resumoDoReadme } from "./readme";
import type { FonteDescricao } from "./tipos";

// O que a Jev sabe do projeto para julgar o tamanho do pedido: a descrição escrita na aba,
// senão o primeiro parágrafo do README do cwd, senão o nome da pasta.

/** README maior que isto só tem o começo lido: a descrição fica nas primeiras linhas. */
const BYTES_README = 64 * 1024;

const cache = new Map<string, { mtimeMs: number; resumo: string | null }>();

/** Resumo do README.md do cwd, relido só quando o arquivo muda. Nunca lança. */
export function descricaoDoReadme(cwd: string): string | null {
  if (!path.isAbsolute(cwd)) return null;
  const arquivo = path.join(cwd, "README.md");
  try {
    const st = fs.statSync(arquivo);
    if (!st.isFile()) return null;
    const mtimeMs = st.mtimeMs;
    const guardado = cache.get(arquivo);
    if (guardado?.mtimeMs === mtimeMs) return guardado.resumo;
    const fd = fs.openSync(arquivo, "r");
    let lido: Buffer;
    try {
      const buf = Buffer.alloc(BYTES_README);
      lido = buf.subarray(0, fs.readSync(fd, buf, 0, BYTES_README, 0));
    } finally {
      fs.closeSync(fd);
    }
    const resumo = resumoDoReadme(lido.toString("utf8"));
    cache.set(arquivo, { mtimeMs, resumo });
    return resumo;
  } catch {
    return null;
  }
}

export function descricaoDoProjeto(origem: string, cwd: string | null, manual: string | null): { texto: string; fonte: FonteDescricao } {
  if (manual?.trim()) return { texto: manual.trim(), fonte: "manual" };
  const readme = cwd ? descricaoDoReadme(cwd) : null;
  return readme ? { texto: readme, fonte: "readme" } : { texto: origem, fonte: "pasta" };
}
