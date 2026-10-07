import { Suspense } from "react";
import { connection } from "next/server";
import { Cabecalho, Painel } from "@/components/Painel";
import { chaveCarregada } from "@/lib/ambiente";
import { montarFeed } from "@/lib/respostas";

async function PainelComDados() {
  // O SQLite é síncrono e o Next não o enxerga: sem isto, o feed seria congelado no build.
  await connection();
  return <Painel feedInicial={montarFeed()} chaveCarregada={chaveCarregada(process.env.TYPESAFE_API_KEY)} />;
}

export default function Pagina() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-[1600px] p-4 md:p-6">
          <Cabecalho sinal="carregando" />
        </div>
      }
    >
      <PainelComDados />
    </Suspense>
  );
}
