import { IconeChave, IconeSimular } from "./icones";

interface Props {
  chaveCarregada: boolean;
  simulando: boolean;
  erro: string | null;
  onSimular: () => void;
}

export function Rodape({ chaveCarregada, simulando, erro, onSimular }: Props) {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-borda pt-3 text-sm text-apagado">
      <span className="flex items-center gap-2">
        <IconeChave className="size-4" />
        <span
          aria-hidden="true"
          className="size-1.5 rounded-full"
          style={{ background: chaveCarregada ? "var(--color-verde)" : "var(--color-apagado)" }}
        />
        TypeSafe: {chaveCarregada ? "chave carregada" : "sem chave"}
      </span>
      <span className="flex items-center gap-3">
        <span role="status" className="text-vermelho">
          {erro ?? ""}
        </span>
        <button
          type="button"
          onClick={onSimular}
          disabled={simulando}
          className="flex min-h-9 items-center gap-1.5 rounded border border-borda px-3 py-1.5 transition-colors hover:border-apagado hover:text-texto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info disabled:opacity-50"
        >
          <IconeSimular className="size-4" />
          {simulando ? "Simulando…" : "Simular"}
        </button>
      </span>
    </footer>
  );
}
