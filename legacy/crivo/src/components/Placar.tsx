import type { Placar as TipoPlacar } from "@/lib/tipos";

const MOSTRADORES = [
  { chave: "passaram", rotulo: "Prompts que passaram", cor: "var(--color-verde)" },
  { chave: "perguntas", rotulo: "Viraram pergunta", cor: "var(--color-ambar)" },
  { chave: "barrados", rotulo: "Prompts barrados", cor: "var(--color-vermelho)" },
  { chave: "segurados", rotulo: "Comandos segurados", cor: "var(--color-vermelho)" },
] as const;

/** Painel anunciador: cada mostrador acende na sua cor quando tem contagem. */
export function Placar({ placar }: { placar: TipoPlacar }) {
  return (
    <section aria-label="Placar" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {MOSTRADORES.map((m) => {
        const valor = placar[m.chave];
        const aceso = valor > 0;
        return (
          <div
            key={m.chave}
            className="rounded-lg border px-4 py-3"
            style={{
              borderColor: aceso ? `color-mix(in oklab, ${m.cor} 35%, var(--color-borda))` : "var(--color-borda)",
              background: aceso
                ? `linear-gradient(to bottom, color-mix(in oklab, ${m.cor} 10%, var(--color-painel)), var(--color-painel))`
                : "var(--color-painel)",
            }}
          >
            <p className="text-sm text-apagado">{m.rotulo}</p>
            <p
              className="mt-1 font-mono text-4xl font-semibold tabular-nums sm:text-5xl"
              style={{
                color: aceso ? m.cor : "var(--color-apagado)",
                textShadow: aceso ? `0 0 20px color-mix(in oklab, ${m.cor} 45%, transparent)` : "none",
              }}
            >
              {String(valor).padStart(3, "0")}
            </p>
          </div>
        );
      })}
    </section>
  );
}
