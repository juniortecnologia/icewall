import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalDriver } from "./driver-local";
import { ServerDriver, createDriver } from "./server-driver";
import "./drivers"; // registra as fábricas ("ssh" e "local")

/**
 * Testes do driver local (Etapa 01 do plano multi-servidor) — mesmo contrato
 * de ServerDriver/SshDriver: exec, put, get, ls, mkdir, ping.
 */

const driver = new LocalDriver({ host: "localhost", user: "tester", keyPath: "" });

let tmp: string;

beforeAll(() => {
  tmp = mkdtempSync(path.join("/tmp/opencode", "icewall-driver-local-"));
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("LocalDriver — contrato ServerDriver", () => {
  it("é uma instância de ServerDriver (mesma interface)", () => {
    expect(driver).toBeInstanceOf(ServerDriver);
  });

  it("fábrica: createDriver('local') produz um LocalDriver", () => {
    const d = createDriver("local", { host: "localhost", user: "u", keyPath: "" });
    expect(d).toBeInstanceOf(LocalDriver);
  });

  it("exec: devolve stdout, code 0 e ms >= 0", async () => {
    const r = await driver.exec("echo olá");
    expect(r.stdout).toBe("olá\n");
    expect(r.code).toBe(0);
    expect(r.ms).toBeGreaterThanOrEqual(0);
  });

  it("exec: captura stderr", async () => {
    const r = await driver.exec("echo falhou 1>&2");
    expect(r.stderr).toContain("falhou");
    expect(r.code).toBe(0);
  });

  it("exec: propaga o código de saída do comando", async () => {
    const r = await driver.exec("exit 3");
    expect(r.code).toBe(3);
  });

  it("exec: timeout mata o processo e marca erro", async () => {
    const r = await driver.exec("sleep 2", 150);
    expect(r.code).toBe(-1);
    expect(r.stderr).toContain("timeout");
  });

  it("put: copia o arquivo criando o diretório de destino", async () => {
    const from = path.join(tmp, "src.txt");
    const to = path.join(tmp, "out", "sub", "dst.txt");
    writeFileSync(from, "conteúdo");
    await driver.put(from, to);
    expect(readFileSync(to, "utf8")).toBe("conteúdo");
  });

  it("put: rejeita origem inexistente", async () => {
    await expect(driver.put(path.join(tmp, "nao-existe.txt"), path.join(tmp, "x.txt"))).rejects.toThrow();
  });

  it("get: copia de volta criando diretórios", async () => {
    const from = path.join(tmp, "a", "origem.txt");
    const to = path.join(tmp, "b", "c", "destino.txt");
    mkdirSync(path.join(tmp, "a"), { recursive: true });
    writeFileSync(from, "123");
    await driver.get(from, to);
    expect(readFileSync(to, "utf8")).toBe("123");
  });

  it("get: rejeita origem inexistente", async () => {
    await expect(driver.get(path.join(tmp, "inexistente.txt"), path.join(tmp, "y.txt"))).rejects.toThrow();
  });

  it("ls: lista as entradas do diretório", async () => {
    const dir = path.join(tmp, "lista");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "a.txt"), "x");
    writeFileSync(path.join(dir, "b.txt"), "y");
    expect(await driver.ls(dir)).toEqual(["a.txt", "b.txt"]);
  });

  it("ls: rejeita diretório inexistente", async () => {
    await expect(driver.ls(path.join(tmp, "não-existe"))).rejects.toThrow();
  });

  it("mkdir: cria diretórios aninhados com o modo pedido", async () => {
    const dir = path.join(tmp, "mkdir", "aninhado");
    await driver.mkdir(dir, "700");
    expect(statSync(dir).mode & 0o777).toBe(0o700);
  });

  it("ping: responde true para o servidor local", async () => {
    expect(await driver.ping()).toBe(true);
  });
});
