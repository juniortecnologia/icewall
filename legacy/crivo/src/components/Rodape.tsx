import { IconeChave } from "./icones";

export function Rodape({ chaveCarregada }: { chaveCarregada: boolean }) {
  return (
    <footer className="flex flex-wrap items-center gap-3 border-t border-borda pt-3 text-sm text-apagado">
      <span className="flex items-center gap-2">
        <IconeChave className="size-4" />
        <span
          aria-hidden="true"
          className="size-1.5 rounded-full"
          style={{ background: chaveCarregada ? "var(--color-verde)" : "var(--color-apagado)" }}
        />
        TypeSafe: {chaveCarregada ? "chave carregada" : "sem chave"}
      </span>
    </footer>
  );
}
