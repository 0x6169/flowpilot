import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { WebChatAdapter } from "../../src/channels/webchat.js";
import { SessionManager } from "../../src/channels/session-manager.js";
import { flow } from "../../src/flow.js";
import { compile } from "../../src/compiler.js";
import { z } from "zod";
import WebSocket from "ws";

function makeManager() {
  const f = flow("test", { state: z.object({ name: z.string().optional() }) })
    .node("ask", async (ctx) => {
      const name = await ctx.prompt("Name?");
      return { type: "reply" as const, text: `Hi ${name}`, stateUpdate: { name } };
    });
  return new SessionManager({ compiledFlows: new Map([["test", compile(f.build())]]) });
}

function waitForMessages(ws: WebSocket, count: number, timeout = 3000): Promise<any[]> {
  return new Promise((resolve) => {
    const messages: any[] = [];
    const timer = setTimeout(() => resolve(messages), timeout);
    ws.on("message", (data) => {
      messages.push(JSON.parse(data.toString()));
      if (messages.length >= count) {
        clearTimeout(timer);
        resolve(messages);
      }
    });
  });
}

describe("WebChatAdapter", () => {
  let adapter: WebChatAdapter;
  let port: number;

  beforeAll(async () => {
    port = 9700 + Math.floor(Math.random() * 100);
    adapter = new WebChatAdapter({ port, sessionManager: makeManager(), defaultFlow: "test" });
    await adapter.start();
  });

  afterAll(async () => {
    await adapter.stop();
  });

  it("accepts WebSocket connections", async () => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>((resolve) => ws.on("open", resolve));
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it("creates session and returns events on message", async () => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>((resolve) => ws.on("open", resolve));

    const messagesPromise = waitForMessages(ws, 3);
    ws.send(JSON.stringify({ type: "start", flowName: "test" }));
    await new Promise(r => setTimeout(r, 100));
    ws.send(JSON.stringify({ type: "message", text: "hello" }));

    const messages = await messagesPromise;
    expect(messages.some((m: any) => m.type === "session_created")).toBe(true);
    expect(messages.some((m: any) => m.type === "prompt:send")).toBe(true);
    ws.close();
  });

  it("handles multi-turn conversation", async () => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>((resolve) => ws.on("open", resolve));

    ws.send(JSON.stringify({ type: "start", flowName: "test" }));
    await new Promise(r => setTimeout(r, 100));
    ws.send(JSON.stringify({ type: "message", text: "hello" }));
    await new Promise(r => setTimeout(r, 200));

    const messagesPromise = waitForMessages(ws, 2, 2000);
    ws.send(JSON.stringify({ type: "message", text: "Alice" }));
    const messages = await messagesPromise;

    expect(messages.some((m: any) => m.type === "message" && m.text?.includes("Alice"))).toBe(true);
    ws.close();
  });
});
