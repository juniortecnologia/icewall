import { describe, it } from "node:test";
import assert from "node:assert";
import { z } from "zod";

/* ── schemas espelhados do route handler ───────────────────── */

const createServerSchema = z.object({
  nome: z.string().min(1).max(64),
  tipo: z.enum(["spark", "generic"]),
  host: z.string().min(1).max(253),
  porta: z.number().int().min(1).max(65535).default(22),
  usuario: z.string().min(1).max(128),
  chaveSshPath: z.string().min(1)
    .describe("caminho local para o arquivo de chave SSH no disco"),
});

const updateServerSchema = z.object({
  nome: z.string().min(1).max(64).optional(),
  tipo: z.enum(["spark", "generic"]).optional(),
  host: z.string().min(1).max(253).optional(),
  porta: z.number().int().min(1).max(65535).optional(),
  usuario: z.string().min(1).max(128).optional(),
  chaveSshPath: z.string().min(1).optional(),
});

/* ── createServerSchema tests ─────────────────────────────── */

describe("Zod — createServerBody", () => {
  it("/accepts payload válido/", () => {
    const r = createServerSchema.safeParse({
      nome: "Spark GPU 01",
      tipo: "spark",
      host: "10.0.5.8",
      porta: 22,
      usuario: "junior",
      chaveSshPath: "/home/junior/.ssh/id_ed25519",
    });
    assert.strictEqual(r.success, true);
  });

  it("/rejeita nome vazio/", () => {
    const r = createServerSchema.safeParse({
      nome: "",
      tipo: "spark" as never,
      host: "x",
      usuario: "x",
      chaveSshPath: "x",
    });
    assert.strictEqual(r.success, false);
  });

  it("/rejeita tipo inválido/", () => {
    const r = createServerSchema.safeParse({
      nome: "t",
      tipo: "invalido" as never,
      host: "x",
      usuario: "x",
      chaveSshPath: "x",
    });
    assert.strictEqual(r.success, false);
  });

  it("/rejeita porta abaixo de 1/", () => {
    const r = createServerSchema.safeParse({
      nome: "t",
      tipo: "spark" as never,
      host: "x",
      porta: 0,
      usuario: "x",
      chaveSshPath: "x",
    });
    assert.strictEqual(r.success, false);
  });

  it("/rejeita porta acima de 65535/", () => {
    const r = createServerSchema.safeParse({
      nome: "t",
      tipo: "spark" as never,
      host: "x",
      porta: 65536,
      usuario: "x",
      chaveSshPath: "x",
    });
    assert.strictEqual(r.success, false);
  });

  it("/rejeita host vazio/", () => {
    const r = createServerSchema.safeParse({
      nome: "t",
      tipo: "spark" as never,
      host: "",
      usuario: "x",
      chaveSshPath: "x",
    });
    assert.strictEqual(r.success, false);
  });

  it("/rejeita chave SSHPath vazia/", () => {
    const r = createServerSchema.safeParse({
      nome: "t",
      tipo: "spark" as never,
      host: "h",
      porta: 22,
      usuario: "u",
      chaveSshPath: "",
    });
    assert.strictEqual(r.success, false);
  });

  it("/usa porta padrão (22) quando omitida/", () => {
    const r = createServerSchema.safeParse({
      nome: "t",
      tipo: "spark" as never,
      host: "h",
      usuario: "u",
      chaveSshPath: "k",
    });
    assert.ok(r.success);
    if (r.success) {
      assert.strictEqual(r.data.porta, 22);
    }
  });

  it("/rejeita nome > 64 chars/", () => {
    const r = createServerSchema.safeParse({
      nome: "t".repeat(65),
      tipo: "spark" as never,
      host: "h",
      usuario: "u",
      chaveSshPath: "k",
    });
    assert.strictEqual(r.success, false);
  });

  it("/rejeita usuário > 128 chars/", () => {
    const r = createServerSchema.safeParse({
      nome: "t",
      tipo: "spark" as never,
      host: "h",
      porta: 22,
      usuario: "u".repeat(129),
      chaveSshPath: "k",
    });
    assert.strictEqual(r.success, false);
  });
});

/* ── updateServerSchema tests ─────────────────────────────── */

describe("Zod — updateServerBody", () => {
  it("/aceita objeto vazio (todos opcionais)/", () => {
    const r = updateServerSchema.safeParse({});
    assert.strictEqual(r.success, true);
  });

  it("/rejeia nome com > 64 chars no update/", () => {
    const r = updateServerSchema.safeParse({ nome: "t".repeat(65) });
    assert.strictEqual(r.success, false);
  });

  it("/aceita subset de campos do update/", () => {
    const r = updateServerSchema.safeParse({ host: "10.0.5.9", porta: 2222 });
    assert.strictEqual(r.success, true);
    if (r.success) {
      assert.strictEqual(r.data.host, "10.0.5.9");
      assert.strictEqual(r.data.porta, 2222);
    }
  });

  it("/rejeia tipo inválido no update/", () => {
    const r = updateServerSchema.safeParse({ tipo: "bogus" as never });
    assert.strictEqual(r.success, false);
  });

  it("/aceita chave SSHPath não vazia no update/", () => {
    const r = updateServerSchema.safeParse({ chaveSshPath: "/new/key" });
    assert.strictEqual(r.success, true);
    if (r.success) {
      assert.strictEqual(r.data.chaveSshPath, "/new/key");
    }
  });
});
