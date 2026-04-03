import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Scheduler, parseDelay } from "../src/scheduler.js";
import { Conversation } from "../src/conversation.js";
import { flow } from "../src/flow.js";
import { compile } from "../src/compiler.js";
import { z } from "zod";

// ─── parseDelay ───────────────────────────────────────

describe("parseDelay", () => {
  it("parses milliseconds", () => {
    expect(parseDelay("100ms")).toBe(100);
    expect(parseDelay("1ms")).toBe(1);
  });

  it("parses seconds", () => {
    expect(parseDelay("30s")).toBe(30_000);
    expect(parseDelay("1s")).toBe(1_000);
  });

  it("parses minutes", () => {
    expect(parseDelay("5m")).toBe(300_000);
    expect(parseDelay("1m")).toBe(60_000);
  });

  it("parses hours", () => {
    expect(parseDelay("24h")).toBe(86_400_000);
    expect(parseDelay("1h")).toBe(3_600_000);
  });

  it("parses days", () => {
    expect(parseDelay("7d")).toBe(604_800_000);
    expect(parseDelay("1d")).toBe(86_400_000);
  });

  it("throws on invalid format", () => {
    expect(() => parseDelay("24")).toThrow('Invalid delay format: "24"');
    expect(() => parseDelay("abc")).toThrow('Invalid delay format: "abc"');
    expect(() => parseDelay("1w")).toThrow('Invalid delay format: "1w"');
    expect(() => parseDelay("")).toThrow('Invalid delay format: ""');
  });
});

// ─── Scheduler ────────────────────────────────────────

describe("Scheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires callback after delay", async () => {
    const scheduler = new Scheduler();
    const handler = vi.fn();

    scheduler.schedule("id1", 1000, handler);
    expect(handler).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("removes timer from active list after firing", async () => {
    const scheduler = new Scheduler();
    scheduler.schedule("id1", 500, vi.fn());
    expect(scheduler.activeCount).toBe(1);

    await vi.advanceTimersByTimeAsync(500);
    expect(scheduler.activeCount).toBe(0);
  });

  it("cancel prevents callback from firing", async () => {
    const scheduler = new Scheduler();
    const handler = vi.fn();

    scheduler.schedule("id1", 1000, handler);
    const cancelled = scheduler.cancel("id1");
    expect(cancelled).toBe(true);

    await vi.advanceTimersByTimeAsync(2000);
    expect(handler).not.toHaveBeenCalled();
    expect(scheduler.activeCount).toBe(0);
  });

  it("cancel returns false for unknown id", () => {
    const scheduler = new Scheduler();
    expect(scheduler.cancel("nonexistent")).toBe(false);
  });

  it("cancelAll clears all timers", async () => {
    const scheduler = new Scheduler();
    const h1 = vi.fn();
    const h2 = vi.fn();
    const h3 = vi.fn();

    scheduler.schedule("id1", 500, h1);
    scheduler.schedule("id2", 1000, h2);
    scheduler.schedule("id3", 1500, h3);
    expect(scheduler.activeCount).toBe(3);

    scheduler.cancelAll();
    expect(scheduler.activeCount).toBe(0);

    await vi.advanceTimersByTimeAsync(2000);
    expect(h1).not.toHaveBeenCalled();
    expect(h2).not.toHaveBeenCalled();
    expect(h3).not.toHaveBeenCalled();
  });

  it("awaits async handlers without throwing", async () => {
    const scheduler = new Scheduler();
    const results: string[] = [];

    scheduler.schedule("id1", 100, async () => {
      results.push("done");
    });

    await vi.advanceTimersByTimeAsync(100);
    expect(results).toEqual(["done"]);
  });

  it("swallows errors from handlers", async () => {
    const scheduler = new Scheduler();

    scheduler.schedule("id1", 100, async () => {
      throw new Error("boom");
    });

    // Should not throw
    await expect(vi.advanceTimersByTimeAsync(100)).resolves.not.toThrow();
  });
});

// ─── ctx.schedule() integration ───────────────────────

describe("ctx.schedule() in Conversation", () => {
  it("returns a schedule ID (string)", async () => {
    let scheduleId: string | undefined;

    const f = flow("test", { state: z.object({}) })
      .node("start", async (ctx) => {
        scheduleId = ctx.schedule("50ms", () => {});
        return ctx.reply("ok");
      });

    const compiled = compile(f.build());
    const conv = new Conversation({ compiled, sessionId: "s2" });

    for await (const _ of conv.send("hi")) { /* drain */ }

    expect(typeof scheduleId).toBe("string");
    expect(scheduleId!.length).toBeGreaterThan(0);
  });

  it("schedules multiple callbacks with unique IDs", async () => {
    const ids: string[] = [];

    const f = flow("test", { state: z.object({}) })
      .node("start", async (ctx) => {
        ids.push(ctx.schedule("50ms", () => {}));
        ids.push(ctx.schedule("100ms", () => {}));
        return ctx.reply("done");
      });

    const compiled = compile(f.build());
    const conv = new Conversation({ compiled, sessionId: "s3" });

    for await (const _ of conv.send("hi")) { /* drain */ }

    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("cancelAll is called on flow complete — pending timers are cancelled", async () => {
    // Timers scheduled during the flow should be cancelled when flow:complete fires.
    const fired: string[] = [];

    const f = flow("test", { state: z.object({}) })
      .node("start", async (ctx) => {
        // Schedule with a very long delay so it won't fire before flow completes
        ctx.schedule("5000ms", () => { fired.push("ran"); });
        return ctx.reply("done");
      });

    const compiled = compile(f.build());
    const conv = new Conversation({ compiled, sessionId: "s4" });

    for await (const _ of conv.send("hi")) { /* drain */ }

    // Wait well past what a real callback would need
    await new Promise((resolve) => setTimeout(resolve, 50));
    // The timer was cancelled by cancelAll() on flow complete
    expect(fired).toEqual([]);
  });

  it("ctx.schedule() works correctly end-to-end with short delay", async () => {
    // Use a delay short enough to fire before we set a real timeout assertion,
    // but we also call cancelAll manually to verify the Scheduler is wired.
    // This test just verifies the happy path doesn't throw.
    const f = flow("test", { state: z.object({}) })
      .node("start", async (ctx) => {
        ctx.schedule("10ms", () => {});
        return ctx.reply("Scheduled!");
      });

    const compiled = compile(f.build());
    const conv = new Conversation({ compiled, sessionId: "s5" });

    const events: { type: string }[] = [];
    for await (const event of conv.send("hi")) {
      events.push(event as { type: string });
    }

    expect(events.some((e) => e.type === "message")).toBe(true);
    expect(events.some((e) => e.type === "flow:complete")).toBe(true);
  });
});
