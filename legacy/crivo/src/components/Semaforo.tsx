import type { ReactNode } from "react";
import type { Semaforo, SemaforoSaida as TipoSemaforoSaida } from "@/lib/tipos";
import { MarcaOk, MarcaPergunta, MarcaX } from "./icones";

export const COR_ENTRADA: Record<Semaforo, string> = {
  verde: "var(--color-verde)",
  amarelo: "var(--color-ambar)",
  vermelho: "var(--color-vermelho)",
};

export const COR_SAIDA: Record<TipoSemaforoSaida, string> = {
  liberado: "var(--color-verde)",
  segurado: "var(--color-vermelho)",
};

export const ROTULO_ENTRADA: Record<Semaforo, string> = {
  verde: "Passou",
  amarelo: "Vai perguntar",
  vermelho: "Barrado",
};

function Lampada({ acesa, cor, children }: { acesa: boolean; cor: string; children: ReactNode }) {
  return (
    <span
      className="grid size-6 place-items-center rounded-full border"
      style={
        acesa
          ? {
              background: cor,
              borderColor: cor,
              color: "var(--color-fundo)",
              boxShadow: `0 0 14px 1px ${cor}, inset 0 0 4px rgb(255 255 255 / 0.45)`,
            }
          : {
              background: `color-mix(in oklab, ${cor} 9%, transparent)`,
              borderColor: `color-mix(in oklab, ${cor} 22%, transparent)`,
            }
      }
    >
      {acesa ? children : null}
    </span>
  );
}

const caixa = "flex shrink-0 flex-col gap-1 rounded-full border border-borda bg-black/70 p-1";

export function SemaforoEntrada({ semaforo }: { semaforo: Semaforo }) {
  return (
    <span role="img" aria-label={`Semáforo: ${ROTULO_ENTRADA[semaforo].toLowerCase()}`} className={caixa}>
      <Lampada acesa={semaforo === "vermelho"} cor={COR_ENTRADA.vermelho}>
        <MarcaX className="size-3.5" />
      </Lampada>
      <Lampada acesa={semaforo === "amarelo"} cor={COR_ENTRADA.amarelo}>
        <MarcaPergunta className="size-3.5" />
      </Lampada>
      <Lampada acesa={semaforo === "verde"} cor={COR_ENTRADA.verde}>
        <MarcaOk className="size-3.5" />
      </Lampada>
    </span>
  );
}

export function SemaforoSaida({ semaforo }: { semaforo: TipoSemaforoSaida }) {
  return (
    <span role="img" aria-label={`Semáforo: ${semaforo}`} className={caixa}>
      <Lampada acesa={semaforo === "segurado"} cor={COR_SAIDA.segurado}>
        <MarcaX className="size-3.5" />
      </Lampada>
      <Lampada acesa={semaforo === "liberado"} cor={COR_SAIDA.liberado}>
        <MarcaOk className="size-3.5" />
      </Lampada>
    </span>
  );
}
