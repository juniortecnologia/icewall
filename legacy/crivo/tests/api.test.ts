import { describe, expect, it } from "vitest";
import type { Feed } from "@/lib/tipos";

process.env.CRIVO_DB = ":memory:";
const { respostaFeed: GET, respostaSimular: POST } = await import("@/lib/respostas");

describe("API", () => {
  it("GET /api/feed devolve os dois feeds e o placar", async () => {
    const r = await GET();
    expect(r.status).toBe(200);
    const feed = (await r.json()) as Feed;
    expect(feed.prompts.length).toBeGreaterThanOrEqual(10);
    expect(feed.comandos.length).toBeGreaterThanOrEqual(10);
    expect(feed.placar).toHaveProperty("segurados");
  });

  it("POST /api/simular acrescenta exatamente um item", async () => {
    const antes = (await (await GET()).json()) as Feed;
    const r = await POST();
    expect(r.status).toBe(200);
    const depois = (await r.json()) as Feed;
    const total = (f: Feed) => f.prompts.length + f.comandos.length;
    expect(total(depois)).toBe(total(antes) + 1);
  });
});
