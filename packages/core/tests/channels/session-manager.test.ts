import { describe, it, expect } from "vitest";
import { SessionManager } from "../../src/channels/session-manager.js";
import { flow } from "../../src/flow.js";
import { compile } from "../../src/compiler.js";
import { z } from "zod";

function makeCompiled() {
  const f = flow("test", { state: z.object({ name: z.string().optional() }) })
    .node("ask", async (ctx) => {
      const name = await ctx.prompt("Name?");
      return { type: "reply" as const, text: `Hi ${name}`, stateUpdate: { name } };
    });
  return compile(f.build());
}

describe("SessionManager", () => {
  it("creates a new conversation for a new session", () => {
    const manager = new SessionManager({ compiledFlows: new Map([["test", makeCompiled()]]) });
    const conv = manager.getOrCreate("session-1", "test");
    expect(conv).toBeDefined();
    expect(conv.status).toBe("idle");
  });

  it("returns same conversation for same session ID", () => {
    const manager = new SessionManager({ compiledFlows: new Map([["test", makeCompiled()]]) });
    const conv1 = manager.getOrCreate("s1", "test");
    const conv2 = manager.getOrCreate("s1", "test");
    expect(conv1).toBe(conv2);
  });

  it("creates different conversations for different IDs", () => {
    const manager = new SessionManager({ compiledFlows: new Map([["test", makeCompiled()]]) });
    const conv1 = manager.getOrCreate("s1", "test");
    const conv2 = manager.getOrCreate("s2", "test");
    expect(conv1).not.toBe(conv2);
  });

  it("throws for unknown flow", () => {
    const manager = new SessionManager({ compiledFlows: new Map() });
    expect(() => manager.getOrCreate("s1", "ghost")).toThrow(/ghost/);
  });

  it("removes a session", () => {
    const manager = new SessionManager({ compiledFlows: new Map([["test", makeCompiled()]]) });
    manager.getOrCreate("s1", "test");
    manager.remove("s1");
    const conv = manager.getOrCreate("s1", "test");
    expect(conv.status).toBe("idle");
  });

  it("lists active sessions", () => {
    const manager = new SessionManager({ compiledFlows: new Map([["test", makeCompiled()]]) });
    manager.getOrCreate("s1", "test");
    manager.getOrCreate("s2", "test");
    expect(manager.activeSessions()).toEqual(["s1", "s2"]);
  });
});
