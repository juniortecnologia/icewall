import type { ReactNode } from "react";

interface Props {
  id: string;
  titulo: string;
  subtitulo: string;
  icone: ReactNode;
  total: number;
  /** No celular, só a coluna da aba ativa aparece. */
  oculta: boolean;
  children: ReactNode;
}

export function Coluna({ id, titulo, subtitulo, icone, total, oculta, children }: Props) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-titulo`}
      className={`${oculta ? "hidden md:flex" : "flex"} min-h-0 flex-col rounded-lg border border-borda bg-painel/70`}
    >
      <header className="flex items-center gap-3 border-b border-borda px-4 py-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-md border border-borda bg-black/40 text-info">
          {icone}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={`${id}-titulo`} className="text-xl font-semibold leading-tight [font-stretch:75%]">
            {titulo}
          </h2>
          <p className="text-sm text-apagado">{subtitulo}</p>
        </div>
        <span className="text-sm text-apagado tabular-nums">{total} itens</span>
      </header>
      <ol className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">{children}</ol>
    </section>
  );
}
