import { describe, expect, it } from "vitest";
import { isModelName, modelfileFromSource } from "./modelfile";

describe("model variant Modelfile", () => {
  it("accepts Ollama model tags and rejects unsafe values", () => {
    expect(isModelName("qwen3.8-code:27b")).toBe(true);
    expect(isModelName("library/model-name:latest")).toBe(true);
    expect(isModelName("model name; rm -rf /")).toBe(false);
  });

  it("replaces blob bases with the registered source and preserves variant settings", () => {
    const modelfile = [
      "# generated",
      "# FROM qwen3.8-code:27b-128k",
      "",
      "FROM /root/.ollama/models/blobs/sha256-abc",
      "FROM /root/.ollama/models/blobs/sha256-def",
      "TEMPLATE {{ .Prompt }}",
      "PARAMETER num_ctx 131072",
      "PARAMETER temperature 0.6",
    ].join("\n");

    expect(modelfileFromSource(modelfile, "qwen3.8:27b")).toBe(
      [
        "FROM qwen3.8:27b",
        "",
        "# generated",
        "# FROM qwen3.8:27b",
        "",
        "TEMPLATE {{ .Prompt }}",
        "PARAMETER num_ctx 131072",
        "PARAMETER temperature 0.6",
        "",
      ].join("\n"),
    );
  });

  it("does not create a model when its definition has no base", () => {
    expect(() => modelfileFromSource("PARAMETER temperature 0.6", "qwen3.8:27b")).toThrow(/sem instrução FROM/);
  });
});
