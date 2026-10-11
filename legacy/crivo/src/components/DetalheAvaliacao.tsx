import { ROTULO_FALTA, mensagemAviso, mensagemBloqueio } from "@/lib/decisao";
import type { Prompt, Tamanho } from "@/lib/tipos";
import { BarraCriterio } from "./BarraCriterio";
import { COR_ENTRADA } from "./Semaforo";

const ROTULO_TAMANHO: Record<Tamanho, string> = {
  ajuste: "ajuste pequeno",
  funcionalidade: "funcionalidade",
  sistema: "sistema inteiro",
};

export type DadosAvaliacao = Pick<Prompt, "semaforo" | "nota" | "criterios" | "faltando" | "avaliacao" | "motivo">;

function Citacao({ titulo, texto, cor }: { titulo: string; texto: string; cor: string }) {
  return (
    <figure>
      <figcaption className="text-xs text-apagado">{titulo}</figcaption>
      <blockquote
        className="mt-1 whitespace-pre-wrap border-l-2 pl-3 font-mono text-sm leading-relaxed [overflow-wrap:anywhere]"
        style={{ borderColor: cor }}
      >
        {texto}
      </blockquote>
    </figure>
  );
}

/** O corpo do item aberto: o mesmo na coluna e na área de teste. */
export function DetalheAvaliacao({ dados }: { dados: DadosAvaliacao }) {
  const { avaliacao, criterios: c } = dados;
  if (avaliacao === "pressa") {
    return (
      <p className="text-sm text-apagado">
        Passou direto (pressa, <code className="font-mono text-texto">&gt;&gt;</code>).
      </p>
    );
  }
  if (avaliacao === "curta") return <p className="text-sm text-apagado">Resposta curta: passou sem avaliação.</p>;
  if (avaliacao === "resposta") {
    return <p className="text-sm text-apagado">Resposta às perguntas do Claude: passou sem avaliação.</p>;
  }
  if (avaliacao === "falhou") {
    return (
      <p className="text-sm" style={{ color: "var(--color-ambar)" }}>
        Não avaliado: {dados.motivo}.
      </p>
    );
  }
  if (avaliacao === null || c === null) return <p className="text-sm text-apagado">Registrado antes da avaliação com IA.</p>;

  const cor = COR_ENTRADA[dados.semaforo];
  const faltando = dados.faltando ?? [];
  return (
    <>
      {faltando.length > 0 ? (
        <p className="text-sm" style={{ color: cor }}>
          Faltou: {faltando.map((f) => ROTULO_FALTA[f]).join("; ")}.
        </p>
      ) : null}
      {dados.semaforo === "amarelo" ? <Citacao titulo="O Claude recebeu" texto={mensagemAviso(faltando)} cor={cor} /> : null}
      {dados.semaforo === "vermelho" && dados.nota !== null ? (
        <Citacao titulo="Barrado. No terminal" texto={mensagemBloqueio(dados.nota, faltando)} cor={cor} />
      ) : null}
      <BarraCriterio rotulo="Tamanho do pedido" pct={c.tamanhoPct} detalhe={ROTULO_TAMANHO[c.tamanho]} escala alerta={c.tamanho === "sistema"} />
      <BarraCriterio rotulo="Objetivo claro" pct={c.objetivoPct} />
      <BarraCriterio rotulo="Diz onde mexer" pct={c.ondePct} />
      <BarraCriterio rotulo="Diz quando está pronto" pct={c.prontoPct} />
      <BarraCriterio rotulo="Foco num assunto só" pct={c.focoPct} />
    </>
  );
}
