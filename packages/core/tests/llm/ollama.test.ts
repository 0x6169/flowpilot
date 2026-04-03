import { describe, it, expect } from "vitest";
import { OllamaAdapter } from "../../src/llm/ollama.js";

describe("OllamaAdapter", () => {
  it("has correct name and capabilities", () => {
    const adapter = new OllamaAdapter({ baseUrl: "http://localhost:11434" });
    expect(adapter.name).toBe("ollama");
    expect(adapter.capabilities.streaming).toBe(true);
    expect(adapter.capabilities.toolUse).toBe(false);
  });

  it("builds correct request body", () => {
    const adapter = new OllamaAdapter({ baseUrl: "http://localhost:11434" });
    const body = (adapter as any).buildBody({
      model: "llama3",
      messages: [{ role: "user", content: "hi" }],
      systemPrompt: "Be helpful.",
    });
    expect(body.model).toBe("llama3");
    expect(body.messages[0]).toEqual({ role: "system", content: "Be helpful." });
    expect(body.messages[1]).toEqual({ role: "user", content: "hi" });
    expect(body.stream).toBe(false);
  });

  it("normalizes base URL (removes trailing slash)", () => {
    const adapter = new OllamaAdapter({ baseUrl: "http://localhost:11434/" });
    expect((adapter as any).baseUrl).toBe("http://localhost:11434");
  });
});
