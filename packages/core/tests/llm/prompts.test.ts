import { describe, it, expect } from "vitest";
import { SystemPromptBuilder } from "../../src/llm/prompts.js";

describe("SystemPromptBuilder", () => {
  it("composes all 4 layers into a single prompt", () => {
    const builder = new SystemPromptBuilder({
      global: "You are Ana, assistant for Store XYZ.",
      flow: "Context: Sales flow.",
      node: "You are a product expert.",
      dynamic: { currentDate: "2026-04-02", userName: "João" },
    });
    const result = builder.build();
    expect(result).toContain("You are Ana");
    expect(result).toContain("Sales flow");
    expect(result).toContain("product expert");
    expect(result).toContain("2026-04-02");
    expect(result).toContain("João");
  });

  it("omits empty layers", () => {
    const builder = new SystemPromptBuilder({
      global: "Global prompt.",
    });
    const result = builder.build();
    expect(result).toBe("Global prompt.");
  });

  it("supports function-based flow prompt", () => {
    const builder = new SystemPromptBuilder({
      global: "Base.",
      flow: (ctx) => `Sentiment: ${ctx.sentiment}`,
    });
    const result = builder.build({ sentiment: "happy" });
    expect(result).toContain("Sentiment: happy");
  });

  it("supports function-based node prompt", () => {
    const builder = new SystemPromptBuilder({
      global: "Base.",
      node: (ctx) => `Product: ${ctx.product}`,
    });
    const result = builder.build({ product: "iPhone" });
    expect(result).toContain("Product: iPhone");
  });

  it("formats dynamic context as key-value pairs", () => {
    const builder = new SystemPromptBuilder({
      global: "Base.",
      dynamic: { currentDate: "2026-04-02", channel: "whatsapp", turn: 5 },
    });
    const result = builder.build();
    expect(result).toContain("currentDate: 2026-04-02");
    expect(result).toContain("channel: whatsapp");
    expect(result).toContain("turn: 5");
  });

  it("memoizes static layers", () => {
    const builder = new SystemPromptBuilder({ global: "Global." });
    const r1 = builder.build();
    const r2 = builder.build();
    expect(r1).toBe(r2);
  });

  it("handles all layers undefined gracefully", () => {
    const builder = new SystemPromptBuilder({});
    const result = builder.build();
    expect(result).toBe("");
  });
});
