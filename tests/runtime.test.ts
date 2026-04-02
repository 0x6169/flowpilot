import { describe, it, expect } from "vitest";
import { runConversation } from "../src/runtime.js";
import { compile } from "../src/compiler.js";
import { flow } from "../src/flow.js";
import { z } from "zod";
import type { FlowEvent } from "../src/types.js";

const schema = z.object({
  greeted: z.boolean().default(false),
});

async function collectEvents(gen: AsyncGenerator<FlowEvent>): Promise<FlowEvent[]> {
  const events: FlowEvent[] = [];
  for await (const event of gen) {
    events.push(event);
  }
  return events;
}

describe("runConversation", () => {
  it("executes a single-node flow and yields events", async () => {
    const f = flow("test", { state: schema })
      .node("start", async (ctx) => {
        return ctx.reply("Hello!");
      });
    const compiled = compile(f.build());
    const events = await collectEvents(runConversation(compiled, "test-session-1"));
    const types = events.map((e) => e.type);
    expect(types).toContain("node:enter");
    expect(types).toContain("message");
    expect(types).toContain("node:exit");
    expect(types).toContain("flow:complete");
    const message = events.find((e) => e.type === "message");
    expect((message as any).text).toBe("Hello!");
  });

  it("follows edges between nodes", async () => {
    const f = flow("test", { state: schema })
      .node("a", async (ctx) => ctx.replyAndGoto("From A", "b"))
      .node("b", async (ctx) => ctx.reply("From B"))
      .edge("a", "b");
    const compiled = compile(f.build());
    const events = await collectEvents(runConversation(compiled, "test-session-2"));
    const messages = events.filter((e) => e.type === "message").map((e) => (e as any).text);
    expect(messages).toEqual(["From A", "From B"]);
  });

  it("updates state between nodes", async () => {
    const f = flow("test", { state: schema })
      .node("a", async (ctx) => {
        return { type: "goto" as const, gotoNode: "b", stateUpdate: { greeted: true } };
      })
      .node("b", async (ctx) => {
        expect(ctx.state.greeted).toBe(true);
        return ctx.reply("Done");
      })
      .edge("a", "b");
    const compiled = compile(f.build());
    const events = await collectEvents(runConversation(compiled, "test-session-3"));
    const complete = events.find((e) => e.type === "flow:complete") as any;
    expect(complete.finalState.greeted).toBe(true);
  });

  it("emits state:update events", async () => {
    const f = flow("test", { state: schema })
      .node("a", async (ctx) => {
        return { type: "goto" as const, gotoNode: "b", stateUpdate: { greeted: true } };
      })
      .node("b", async (ctx) => ctx.reply("done"));
    const compiled = compile(f.build());
    const events = await collectEvents(runConversation(compiled, "test-session-4"));
    const stateUpdates = events.filter((e) => e.type === "state:update");
    expect(stateUpdates.length).toBeGreaterThan(0);
  });

  it("terminates when node returns reply without goto", async () => {
    const f = flow("test", { state: schema })
      .node("only", async (ctx) => ctx.reply("The end"));
    const compiled = compile(f.build());
    const events = await collectEvents(runConversation(compiled, "test-session-5"));
    expect(events[events.length - 1].type).toBe("flow:complete");
  });

  it("emits error event on node handler failure", async () => {
    const f = flow("test", { state: schema })
      .node("bad", async () => {
        throw new Error("boom");
      });
    const compiled = compile(f.build());
    const events = await collectEvents(runConversation(compiled, "test-session-6"));
    const errorEvent = events.find((e) => e.type === "error") as any;
    expect(errorEvent).toBeDefined();
    expect(errorEvent.error.message).toBe("boom");
  });
});
