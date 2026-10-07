import { beforeAll, describe, expect, it } from "vitest";
import type { Feed } from "@/lib/tipos";

process.env.CRIVO_DB = ":memory:";
const { respostaFeed, respostaGanchoFerramenta, respostaGanchoPrompt } = await import("@/lib/respostas");

const post = (corpo: unknown) =>
  new Request("http://127.0.0.1:4000/api/ganchos/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });
const feed = async () => (await respostaFeed().json()) as Feed;
const total = (f: Feed) => f.prompts.length + f.comandos.length;
const base = { session_id: "sess-1", cwd: "/home/junior/Projects/happy-team-chat" };

beforeAll(() => {
  Reflect.deleteProperty(globalThis, "__crivoConexao");
});

// Os testes compartilham o mesmo banco em memória e rodam em ordem.
describe("portas dos ganchos", () => {
  it("o feed começa vazio e desconectado", async () => {
    const f = await feed();
    expect(total(f)).toBe(0);
    expect(f.conexao).toEqual({ conectado: false, ultimoSinal: null });
  });

  it("ferramenta: responde {} e grava, mas não acende o 'conectado'", async () => {
    const r = await respostaGanchoFerramenta(post({ ...base, tool_name: "Bash", tool_input: { command: "pnpm test" } }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({});
    const f = await feed();
    expect(f.comandos[0]).toMatchObject({ tipo: "comando", alvo: "pnpm test", semaforo: "liberado", origem: "happy-team-chat" });
    expect(f.conexao.conectado).toBe(false);
    expect(f.conexao.ultimoSinal).not.toBeNull();
  });

  it("prompt: responde {}, grava verde sem nota e acende o 'conectado'", async () => {
    const r = await respostaGanchoPrompt(post({ ...base, hook_event_name: "UserPromptSubmit", prompt: "corrige o login" }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({});
    const f = await feed();
    expect(f.prompts[0]).toMatchObject({ texto: "corrige o login", nota: null, criterios: null, semaforo: "verde", sessao: "sess-1" });
    expect(f.placar.passaram).toBe(1);
    expect(f.conexao.conectado).toBe(true);
  });

  it("JSON quebrado e pacote incompleto: 400 sem gravar nada", async () => {
    const antes = total(await feed());
    expect((await respostaGanchoPrompt(post("{quebrado"))).status).toBe(400);
    expect((await respostaGanchoPrompt(post({ ...base }))).status).toBe(400);
    expect((await respostaGanchoFerramenta(post({ ...base, tool_name: "Bash", tool_input: {} }))).status).toBe(400);
    expect(total(await feed())).toBe(antes);
  });

  it("ferramenta fora do portão: 200 {} sem gravar", async () => {
    const antes = total(await feed());
    const r = await respostaGanchoFerramenta(post({ ...base, tool_name: "Read", tool_input: { file_path: "/x" } }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({});
    expect(total(await feed())).toBe(antes);
  });
});
