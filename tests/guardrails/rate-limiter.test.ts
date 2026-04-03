import { describe, it, expect } from "vitest";
import { rateLimiter } from "../../src/guardrails/rate-limiter.js";

describe("rateLimiter", () => {
  it("creates a HookDefinition with on and handler", () => {
    const hook = rateLimiter({ max: 5, window: "1m" });
    expect(hook).toHaveProperty("on");
    expect(hook).toHaveProperty("handler");
    expect(typeof hook.handler).toBe("function");
  });

  it("allows requests under the limit", async () => {
    const hook = rateLimiter({ max: 3, window: "1m" });
    const ctx = { sessionId: "session-allow" };
    const r1 = await hook.handler(ctx);
    const r2 = await hook.handler(ctx);
    const r3 = await hook.handler(ctx);
    expect(r1).toBeUndefined();
    expect(r2).toBeUndefined();
    expect(r3).toBeUndefined();
  });

  it("blocks requests over the limit", async () => {
    const hook = rateLimiter({ max: 2, window: "1m" });
    const ctx = { sessionId: "session-block" };
    await hook.handler(ctx);
    await hook.handler(ctx);
    const result = await hook.handler(ctx);
    expect(result).toHaveProperty("block");
    expect((result as { block: string }).block).toMatch(/Rate limit exceeded/);
  });

  it("tracks limits per session independently", async () => {
    const hook = rateLimiter({ max: 2, window: "1m" });
    const ctxA = { sessionId: "session-a" };
    const ctxB = { sessionId: "session-b" };
    await hook.handler(ctxA);
    await hook.handler(ctxA);
    const blockedA = await hook.handler(ctxA);
    expect(blockedA).toHaveProperty("block");

    // session-b is unaffected
    const r1B = await hook.handler(ctxB);
    const r2B = await hook.handler(ctxB);
    expect(r1B).toBeUndefined();
    expect(r2B).toBeUndefined();
  });

  it("resets after window expires", async () => {
    const hook = rateLimiter({ max: 2, window: "100ms" });
    const ctx = { sessionId: "session-reset" };
    await hook.handler(ctx);
    await hook.handler(ctx);
    const blocked = await hook.handler(ctx);
    expect(blocked).toHaveProperty("block");

    await new Promise((resolve) => setTimeout(resolve, 150));

    const afterReset = await hook.handler(ctx);
    expect(afterReset).toBeUndefined();
  });
});
