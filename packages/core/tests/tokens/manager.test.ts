import { describe, it, expect } from "vitest";
import { TokenManager } from "../../src/tokens/manager.js";

describe("TokenManager", () => {
  it("tracks whether budget is exceeded", () => {
    const tm = new TokenManager({ budget: { maxTokensPerConversation: 1000 } });
    tm.addTokens(500);
    expect(tm.isBudgetExceeded()).toBe(false);
    tm.addTokens(600);
    expect(tm.isBudgetExceeded()).toBe(true);
  });

  it("tracks cost budget", () => {
    const tm = new TokenManager({ budget: { maxCostPerConversation: 0.10 } });
    tm.addCost(0.05);
    expect(tm.isCostExceeded()).toBe(false);
    tm.addCost(0.06);
    expect(tm.isCostExceeded()).toBe(true);
  });

  it("reports whether compaction is needed", () => {
    const tm = new TokenManager({
      compaction: { microCompactAt: 0.5, fullCompactAt: 0.7 },
      contextWindowSize: 1000,
    });
    tm.setCurrentTokens(400);
    expect(tm.shouldMicroCompact()).toBe(false);
    expect(tm.shouldFullCompact()).toBe(false);
    tm.setCurrentTokens(550);
    expect(tm.shouldMicroCompact()).toBe(true);
    expect(tm.shouldFullCompact()).toBe(false);
    tm.setCurrentTokens(750);
    expect(tm.shouldMicroCompact()).toBe(true);
    expect(tm.shouldFullCompact()).toBe(true);
  });

  it("respects circuit breaker on consecutive failures", () => {
    const tm = new TokenManager({ compaction: { circuitBreakerMax: 2 } });
    expect(tm.canAttemptCompaction()).toBe(true);
    tm.recordCompactionFailure();
    expect(tm.canAttemptCompaction()).toBe(true);
    tm.recordCompactionFailure();
    expect(tm.canAttemptCompaction()).toBe(false);
  });

  it("resets circuit breaker on success", () => {
    const tm = new TokenManager({ compaction: { circuitBreakerMax: 2 } });
    tm.recordCompactionFailure();
    tm.recordCompactionFailure();
    expect(tm.canAttemptCompaction()).toBe(false);
    tm.recordCompactionSuccess();
    expect(tm.canAttemptCompaction()).toBe(true);
  });

  it("reports summary stats", () => {
    const tm = new TokenManager({ budget: { maxTokensPerConversation: 10000 } });
    tm.addTokens(5000);
    tm.addCost(0.05);
    const stats = tm.getStats();
    expect(stats.totalTokens).toBe(5000);
    expect(stats.totalCost).toBeCloseTo(0.05);
  });
});
