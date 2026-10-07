import { formatarHora } from "@/lib/hora";
import type { Comando } from "@/lib/tipos";
import { IconeArquivo, IconeTerminal } from "./icones";
import { COR_SAIDA, SemaforoSaida } from "./Semaforo";

export function ItemComando({ comando, novo }: { comando: Comando; novo: boolean }) {
  const segurado = comando.semaforo === "segurado";
  const cor = COR_SAIDA[comando.semaforo];
  const Icone = comando.tipo === "arquivo" ? IconeArquivo : IconeTerminal;

  return (
    <li
      className={`flex items-start gap-3 rounded-md border bg-painel p-3 ${
        segurado ? "border-vermelho/40" : "border-borda"
      } ${novo ? "animate-entrada" : ""}`}
    >
      <SemaforoSaida semaforo={comando.semaforo} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <Icone className="mt-0.5 size-4 shrink-0 text-apagado" />
          <span className="sr-only">{comando.tipo === "arquivo" ? "Arquivo:" : "Comando:"}</span>
          <code className="font-mono text-sm leading-relaxed [overflow-wrap:anywhere]">
            {comando.tipo === "comando" ? <span className="text-apagado">$ </span> : null}
            {comando.alvo}
          </code>
        </div>
        {comando.regra ? (
          <p className="mt-2 text-sm text-vermelho">Regra: {comando.regra}</p>
        ) : (
          <p className="mt-2 text-sm text-apagado">Nenhuma regra tocada</p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 text-sm">
        <span className="font-medium" style={{ color: cor }}>
          {segurado ? "Segurado" : "Liberado"}
        </span>
        <time dateTime={comando.criadoEm} className="text-apagado tabular-nums">
          {formatarHora(comando.criadoEm)}
        </time>
      </div>
    </li>
  );
}
