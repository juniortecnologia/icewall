import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { sparkExec } from "./spark/ssh";
import { getDb } from "./db/client";
import { servers } from "./db/schema";
import { execOnServer, serverIdByName } from "./executor";

/**
 * Testes do executor por servidor (Etapa 02 do plano multi-servidor).
 * O setup de vitest aponta ICEWALL_DB para ":memory:" — banco já migrado
 * com o seed de Station (local) + Spark (ssh). Nada toca o data/icewall.db.
 */

describe("execOnServer — mesmo contrato em qualquer servidor", () => {
  it("executa na Station (driver local) e devolve o ExecResult", async () => {
    const id = serverIdByName("Station");
    expect(id, "o seed deve criar a Station").not.toBeNull();
    const res = await execOnServer(id!, "echo estação");
    expect(res.code).toBe(0);
    expect(res.stdout).toBe("estação\n");
    expect(res.stderr).toBe("");
    expect(res.ms).toBeGreaterThanOrEqual(0);
  });

  it("captura código de saída diferente de zero", async () => {
    const res = await execOnServer(serverIdByName("Station")!, "exit 3");
    expect(res.code).toBe(3);
  });

  it("executa no Spark pelo driver do registro (sem host fixo)", async () => {
    sparkComoLocal();
    const res = await execOnServer(serverIdByName("Spark")!, "echo via registro");
    expect(res.code).toBe(0);
    expect(res.stdout).toBe("via registro\n");
  });

  it("servidor inexistente → erro claro (code -1, mensagem; nunca lista vazia/silêncio)", async () => {
    const res = await execOnServer(999_999, "true");
    expect(res.code).toBe(-1);
    expect(res.stdout).toBe("");
    expect(res.stderr).toContain("servidor inexistente no registro");
  });

  it("servidor SSH com campos incompletos → erro claro (não tenta conectar)", async () => {
    const id = getDb()
      .insert(servers)
      .values({ nome: "SemCampos", tipo: "ssh", host: "10.0.0.9" })
      .returning()
      .get()!.id;
    const res = await execOnServer(id, "true");
    expect(res.code).toBe(-1);
    expect(res.stderr).toContain("campos SSH incompletos");
    expect(res.stderr).toContain("usuario");
    expect(res.stderr).toContain("chaveSshPath");
  });

  it("servidor SSH indisponível (host fora do ar) → erro claro no stderr", async () => {
    const id = getDb()
      .insert(servers)
      .values({
        nome: "ForaDoAr",
        tipo: "ssh",
        host: "127.0.0.1",
        porta: 2, // porta que não responde
        usuario: "naoexiste",
        chaveSshPath: "/tmp/opencode/chave-inexistente",
      })
      .returning()
      .get()!.id;
    const res = await execOnServer(id, "true", 5_000);
    expect(res.code).not.toBe(0); // ssh fora do ar sai com 255 (ou -1 se o binário falhar)
    expect(res.stdout).toBe("");
    expect(res.stderr.length).toBeGreaterThan(0);
  });
});

function sparkComoLocal(): void {
  // Aponta a linha Spark para a máquina local: prova que a fachada usa o
  // registro (e não um host fixo em constante) — se houvesse constante,
  // este comando não rodaria com esta configuração.
  getDb()
    .update(servers)
    .set({ tipo: "local", host: "localhost", porta: null, usuario: null, chaveSshPath: null })
    .where(eq(servers.nome, "Spark"))
    .run();
}

describe("sparkExec — fachada sobre o servidor \"Spark\" do registro", () => {
  it("delega ao Spark resolvido por nome no registro", async () => {
    sparkComoLocal();
    const res = await sparkExec("echo via fachada");
    expect(res.code).toBe(0);
    expect(res.stdout).toBe("via fachada\n");
  });

  it("Spark fora do registro → erro claro (não depende da constante SPARK_SSH_HOST)", async () => {
    getDb().delete(servers).where(eq(servers.nome, "Spark")).run();
    const res = await sparkExec("true");
    expect(res.code).toBe(-1);
    expect(res.stderr).toContain('"Spark"');
  });
});
