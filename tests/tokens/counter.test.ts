import { describe, it, expect } from "vitest";
import { TokenCounter } from "../../src/tokens/counter.js";

describe("TokenCounter", () => {
  it("estimates tokens from text (~4 chars per token)", () => {
    const counter = new TokenCounter();
    const count = counter.estimate("Hello, world!");
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(10);
  });

  it("estimates tokens from message array", () => {
    const counter = new TokenCounter();
    const count = counter.estimateMessages([
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hello!" },
    ]);
    expect(count).toBeGreaterThan(0);
  });

  it("tracks cumulative usage", () => {
    const counter = new TokenCounter();
    counter.addUsage({ inputTokens: 100, outputTokens: 50, totalTokens: 150 });
    counter.addUsage({ inputTokens: 200, outputTokens: 100, totalTokens: 300 });
    expect(counter.totalUsage.inputTokens).toBe(300);
    expect(counter.totalUsage.outputTokens).toBe(150);
    expect(counter.totalUsage.totalTokens).toBe(450);
  });

  it("calculates estimated cost", () => {
    const counter = new TokenCounter();
    counter.addUsage({ inputTokens: 1_000_000, outputTokens: 500_000, totalTokens: 1_500_000 });
    const cost = counter.estimateCost({ inputCostPer1M: 1.0, outputCostPer1M: 5.0 });
    expect(cost).toBeCloseTo(3.5);
  });

  it("reports context usage percentage", () => {
    const counter = new TokenCounter({ contextWindowSize: 100_000 });
    counter.setCurrentContextTokens(70_000);
    expect(counter.contextUsagePercent()).toBeCloseTo(70);
  });
});
