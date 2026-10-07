import { describe, expect, it } from "vitest";
import { semaforoDaNota } from "@/lib/avaliacao";
import { abrirBanco, lerFeed } from "@/lib/db";
import { gravarItem, sortearItem } from "@/lib/simulador";

// gerador previsível para o teste não depender da sorte
function sementeira(semente: number) {
  let s = semente;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe("sortearItem", () => {
  it("sempre gera itens válidos", () => {
    const rand = sementeira(42);
    const tipos = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const item = sortearItem(rand, new Date("2026-10-06T16:00:00Z"));
      tipos.add(item.tipo);
      expect(item.dados.criadoEm).toBe("2026-10-06T16:00:00.000Z");
      if (item.tipo === "prompt") {
        const { criterios, nota } = item.dados;
        for (const v of [criterios.tamanhoPct, criterios.objetivoPct, criterios.ondePct, criterios.prontoPct, criterios.focoPct, nota]) {
          expect(Number.isInteger(v) && v >= 0 && v <= 100).toBe(true);
        }
        expect(item.dados.texto.length).toBeGreaterThan(0);
      } else {
        expect(item.dados.alvo.length).toBeGreaterThan(0);
        expect(["comando", "arquivo"]).toContain(item.dados.tipo);
      }
    }
    expect(tipos).toEqual(new Set(["prompt", "comando"]));
  });

  it("produz as três cores de prompt ao longo de muitos sorteios", () => {
    const rand = sementeira(7);
    const cores = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const item = sortearItem(rand);
      if (item.tipo === "prompt") cores.add(semaforoDaNota(item.dados.nota));
    }
    expect(cores).toEqual(new Set(["verde", "amarelo", "vermelho"]));
  });
});

describe("gravarItem", () => {
  it("o item sorteado entra no topo do feed", () => {
    const db = abrirBanco(":memory:", Date.parse("2026-10-06T15:00:00Z"));
    const item = sortearItem(sementeira(1), new Date("2026-10-06T16:00:00Z"));
    gravarItem(db, item);
    const feed = lerFeed(db);
    const topo = item.tipo === "prompt" ? feed.prompts[0].texto : feed.comandos[0].alvo;
    expect(topo).toBe(item.tipo === "prompt" ? item.dados.texto : item.dados.alvo);
  });
});
