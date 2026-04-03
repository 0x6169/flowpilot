import { describe, it, expect } from "vitest";
import { ResultLimiter } from "../../src/tokens/result-limiter.js";

describe("ResultLimiter", () => {
  it("passes through small results unchanged", () => {
    const limiter = new ResultLimiter({ maxCharsPerTool: 50_000 });
    const result = limiter.limit("Short text");
    expect(result.text).toBe("Short text");
    expect(result.truncated).toBe(false);
  });

  it("truncates results exceeding maxCharsPerTool", () => {
    const limiter = new ResultLimiter({ maxCharsPerTool: 100 });
    const longText = "a".repeat(500);
    const result = limiter.limit(longText);
    expect(result.text.length).toBeLessThan(200);
    expect(result.truncated).toBe(true);
    expect(result.text).toContain("[truncated");
  });

  it("truncates with custom message", () => {
    const limiter = new ResultLimiter({ maxCharsPerTool: 50, truncationMessage: "... (cut)" });
    const result = limiter.limit("a".repeat(200));
    expect(result.text).toContain("... (cut)");
  });

  it("tracks total chars per turn", () => {
    const limiter = new ResultLimiter({ maxCharsPerTool: 1000, maxCharsPerTurn: 100 });
    limiter.limit("a".repeat(60));
    const second = limiter.limit("b".repeat(60));
    expect(second.truncated).toBe(true);
  });

  it("resets per-turn tracking", () => {
    const limiter = new ResultLimiter({ maxCharsPerTool: 1000, maxCharsPerTurn: 100 });
    limiter.limit("a".repeat(60));
    limiter.resetTurn();
    const result = limiter.limit("b".repeat(60));
    expect(result.truncated).toBe(false);
  });
});
