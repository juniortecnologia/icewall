import { semaforoDaNota } from "@/lib/avaliacao";
import { COR_ENTRADA } from "./Semaforo";

const SEGMENTOS = 20;

interface Props {
  rotulo: string;
  pct: number;
  /** Texto curto ao lado da porcentagem (ex.: a classe do tamanho). */
  detalhe?: string;
  /** Escala neutra (o tamanho): não é bom nem ruim. */
  escala?: boolean;
  /** Na escala, pinta de alerta (ex.: sistema inteiro). */
  alerta?: boolean;
}

export function BarraCriterio({ rotulo, pct, detalhe, escala = false, alerta = false }: Props) {
  const acesos = Math.round((pct / 100) * SEGMENTOS);
  const cor = escala ? (alerta ? "var(--color-vermelho)" : "var(--color-info)") : COR_ENTRADA[semaforoDaNota(pct)];
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 sm:grid-cols-[11rem_1fr_auto]">
      <span className="text-sm text-apagado">{rotulo}</span>
      <div
        role="meter"
        aria-label={rotulo}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={detalhe ? `${detalhe}, ${pct}%` : `${pct}%`}
        className="order-last col-span-2 flex h-3 gap-[3px] sm:order-none sm:col-span-1"
      >
        {Array.from({ length: SEGMENTOS }, (_, i) => (
          <span
            key={i}
            className="flex-1 rounded-[1px]"
            style={i < acesos ? { background: cor, boxShadow: `0 0 6px -1px ${cor}` } : { background: "var(--color-borda)" }}
          />
        ))}
      </div>
      <span className="text-right text-sm tabular-nums">
        {detalhe ? (
          <span className="mr-2" style={{ color: alerta ? "var(--color-vermelho)" : "var(--color-apagado)" }}>
            {detalhe}
          </span>
        ) : null}
        <span className="font-semibold" style={{ color: cor }}>
          {pct}%
        </span>
      </span>
    </div>
  );
}
