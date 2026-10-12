const MODEL_NAME = /^[A-Za-z0-9][A-Za-z0-9_.:/@-]{0,200}$/;

export function isModelName(value: string): boolean {
  return MODEL_NAME.test(value);
}

export function modelfileFromSource(modelfile: string, source: string): string {
  if (!isModelName(source)) throw new Error("tag de origem inválida");
  if (!/^FROM\s+.+$/im.test(modelfile)) throw new Error("Modelfile sem instrução FROM; não é possível recriar a variante com segurança");

  const rest = modelfile
    .replace(/^FROM\s+.+$/gim, "")
    .replace(/^(# FROM\s+).+$/gm, `$1${source}`)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return `FROM ${source}\n\n${rest}\n`;
}
