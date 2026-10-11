import { describe, expect, it } from "vitest";
import { lerGanchoFerramenta, lerGanchoPrompt } from "@/server/crivo/ganchos";

const agora = new Date("2026-10-07T12:00:00.000Z");
const base = { session_id: "sess-1", cwd: "/home/junior/Projects/happy-team-chat" };

describe("lerGanchoPrompt", () => {
  it("traduz o pacote do UserPromptSubmit", () => {
    const p = lerGanchoPrompt({ ...base, hook_event_name: "UserPromptSubmit", prompt: "corrige o login\nem src/auth" }, agora);
    expect(p).toEqual({
      texto: "corrige o login\nem src/auth",
      ts: agora.getTime(),
      origem: "happy-team-chat",
      sessao: "sess-1",
    });
  });

  it("aceita cwd com barra no fim e sessão ausente", () => {
    const p = lerGanchoPrompt({ cwd: "/home/junior/Projects/happy-team-chat/", prompt: "oi" }, agora);
    expect(p?.origem).toBe("happy-team-chat");
    expect(p?.sessao).toBeNull();
  });

  it.each([
    ["sem prompt", { ...base }],
    ["prompt só com espaços", { ...base, prompt: "   " }],
    ["prompt que não é texto", { ...base, prompt: 42 }],
    ["sem cwd", { session_id: "s", prompt: "oi" }],
    ["corpo nulo", null],
    ["corpo lista", [1, 2]],
    ["corpo texto", "oi"],
  ])("recusa pacote inválido: %s", (_, corpo) => {
    expect(lerGanchoPrompt(corpo, agora)).toBeNull();
  });
});

describe("lerGanchoFerramenta", () => {
  const pacote = (tool_name: string, tool_input: unknown) => ({ ...base, hook_event_name: "PreToolUse", tool_name, tool_input });

  it.each([
    ["Bash", { command: "pnpm test", description: "roda" }, "comando", "pnpm test"],
    ["Write", { file_path: "/p/src/a.ts", content: "x" }, "arquivo", "/p/src/a.ts"],
    ["Edit", { file_path: "/p/src/b.ts", old_string: "a", new_string: "b" }, "arquivo", "/p/src/b.ts"],
    ["MultiEdit", { file_path: "/p/src/c.ts", edits: [] }, "arquivo", "/p/src/c.ts"],
    ["NotebookEdit", { notebook_path: "/p/n.ipynb", new_source: "" }, "arquivo", "/p/n.ipynb"],
  ])("%s vira %s com o alvo certo", (ferramenta, entrada, tipo, alvo) => {
    expect(lerGanchoFerramenta(pacote(ferramenta, entrada), agora)).toEqual({
      tipo,
      alvo,
      regra: null,
      ts: agora.getTime(),
      origem: "happy-team-chat",
      sessao: "sess-1",
    });
  });

  it.each(["Read", "Grep", "constructor", "toString", "__proto__"])("ferramenta fora da lista (%s) é ignorada", (nome) => {
    expect(lerGanchoFerramenta(pacote(nome, { command: "x", file_path: "y" }), agora)).toBe("ignorar");
  });

  it.each([
    ["Bash sem command", pacote("Bash", { description: "x" })],
    ["Bash com command vazio", pacote("Bash", { command: "  " })],
    ["Write sem file_path", pacote("Write", { content: "x" })],
    ["tool_input ausente", { ...base, tool_name: "Bash" }],
    ["sem tool_name", { ...base, tool_input: { command: "ls" } }],
    ["sem cwd", { tool_name: "Bash", tool_input: { command: "ls" } }],
    ["corpo nulo", null],
  ])("recusa pacote inválido: %s", (_, corpo) => {
    expect(lerGanchoFerramenta(corpo, agora)).toBeNull();
  });
});
