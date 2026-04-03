import { describe, it, expect } from "vitest";
import { OpenAICompatibleAdapter } from "../../src/llm/openai-compatible.js";

describe("OpenAICompatibleAdapter", () => {
  it("uses custom name", () => {
    const adapter = new OpenAICompatibleAdapter({
      name: "vllm",
      baseUrl: "http://localhost:8000/v1",
    });
    expect(adapter.name).toBe("vllm");
  });

  it("can be named for litellm", () => {
    const adapter = new OpenAICompatibleAdapter({
      name: "litellm",
      baseUrl: "http://localhost:4000",
      apiKey: "sk-litellm",
    });
    expect(adapter.name).toBe("litellm");
  });

  it("can be named for openrouter", () => {
    const adapter = new OpenAICompatibleAdapter({
      name: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "sk-openrouter",
    });
    expect(adapter.name).toBe("openrouter");
  });

  it("builds params with system prompt as message", () => {
    const adapter = new OpenAICompatibleAdapter({
      name: "test",
      baseUrl: "http://localhost:8000/v1",
    });
    const params = (adapter as any).buildParams({
      model: "llama3",
      messages: [{ role: "user", content: "hi" }],
      systemPrompt: "Be helpful.",
    });
    expect(params.messages[0]).toEqual({ role: "system", content: "Be helpful." });
  });
});
