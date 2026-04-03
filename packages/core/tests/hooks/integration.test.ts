import { describe, it, expect, vi } from "vitest";
import { Conversation } from "../../src/conversation.js";
import { flow } from "../../src/flow.js";
import { compile } from "../../src/compiler.js";
import { z } from "zod";
import type { FlowEvent, HookDefinition } from "../../src/types.js";

async function collectEvents(gen: AsyncGenerator<FlowEvent>): Promise<FlowEvent[]> {
  const events: FlowEvent[] = [];
  for await (const event of gen) events.push(event);
  return events;
}

function makeFlow() {
  return flow("test", { state: z.object({ visited: z.array(z.string()).optional() }) })
    .node("start", async (ctx) => ctx.reply("Hello from start"))
    .node("other", async (ctx) => ctx.reply("Hello from other"));
}

describe("HookRunner integration with Conversation", () => {
  it("before:node block skips the node and advances to next", async () => {
    const f = flow("test", { state: z.object({}) })
      .node("start", async (ctx) => ctx.reply("Should be skipped"))
      .node("end", async (ctx) => ctx.reply("End reached"))
      .edge("start", "end");

    const compiled = compile(f.build());
    const hooks: HookDefinition[] = [
      {
        on: "before:node",
        handler: async (ctx) => {
          const c = ctx as { node: string };
          if (c.node === "start") return { block: "node is blocked" };
        },
      },
    ];
    const conv = new Conversation({ compiled, sessionId: "s1", hooks });
    const events = await collectEvents(conv.send("hi"));

    const messages = events.filter((e) => e.type === "message").map((e) => (e as { text: string }).text);
    // start node is blocked (skipped), so only end node message appears
    expect(messages).not.toContain("Should be skipped");
    expect(messages).toContain("End reached");
  });

  it("before:node redirect changes the current node", async () => {
    const compiled = compile(makeFlow().build());
    const hooks: HookDefinition[] = [
      {
        on: "before:node",
        handler: async (ctx) => {
          const c = ctx as { node: string };
          if (c.node === "start") return { redirect: "other" };
        },
      },
    ];
    const conv = new Conversation({ compiled, sessionId: "s1", hooks });
    const events = await collectEvents(conv.send("hi"));

    const messages = events.filter((e) => e.type === "message").map((e) => (e as { text: string }).text);
    expect(messages).not.toContain("Hello from start");
    expect(messages).toContain("Hello from other");
  });

  it("after:node is called with the node result", async () => {
    const afterNodeSpy = vi.fn();
    const compiled = compile(makeFlow().build());
    const hooks: HookDefinition[] = [
      {
        on: "after:node",
        handler: async (ctx) => {
          afterNodeSpy(ctx);
        },
      },
    ];
    const conv = new Conversation({ compiled, sessionId: "s1", hooks });
    await collectEvents(conv.send("hi"));

    expect(afterNodeSpy).toHaveBeenCalledOnce();
    const callArg = afterNodeSpy.mock.calls[0][0] as { node: string; result: { type: string } };
    expect(callArg.node).toBe("start");
    expect(callArg.result).toBeDefined();
    expect(callArg.result.type).toBe("reply");
  });

  it("before:turn blocks a rate-limited user and yields an error event", async () => {
    const compiled = compile(makeFlow().build());
    const hooks: HookDefinition[] = [
      {
        on: "before:turn",
        handler: async () => ({ block: "rate limited" }),
      },
    ];
    const conv = new Conversation({ compiled, sessionId: "s1", hooks });
    const events = await collectEvents(conv.send("hi"));

    const errors = events.filter((e) => e.type === "error");
    expect(errors).toHaveLength(1);
    const err = errors[0] as { type: "error"; error: Error; recoverable: boolean };
    expect(err.error.message).toContain("rate limited");
    expect(err.recoverable).toBe(true);
    // No messages emitted, flow not started
    expect(events.filter((e) => e.type === "message")).toHaveLength(0);
  });

  it("multiple hooks run in order", async () => {
    const order: string[] = [];
    const compiled = compile(makeFlow().build());
    const hooks: HookDefinition[] = [
      { on: "before:node", handler: async () => { order.push("hook-a"); } },
      { on: "before:node", handler: async () => { order.push("hook-b"); } },
      { on: "before:node", handler: async () => { order.push("hook-c"); } },
    ];
    const conv = new Conversation({ compiled, sessionId: "s1", hooks });
    await collectEvents(conv.send("hi"));

    expect(order).toEqual(["hook-a", "hook-b", "hook-c"]);
  });
});
