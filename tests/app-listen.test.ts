import { describe, it, expect, afterEach } from "vitest";
import { createFlowPilot, flow } from "../src/index.js";
import { z } from "zod";

describe("FlowPilotApp.listen()", () => {
  let cleanup: (() => Promise<void>) | null = null;

  afterEach(async () => {
    if (cleanup) { await cleanup(); cleanup = null; }
  });

  it("starts REST API server", async () => {
    const port = 9500 + Math.floor(Math.random() * 100);
    const f = flow("test", { state: z.object({}) })
      .node("start", async (ctx) => ctx.reply("Hello!"));
    const app = createFlowPilot({ flows: [f], api: { port } });
    const handle = await app.listen();
    cleanup = () => handle.stop();

    const res = await fetch(`http://localhost:${port}/api/health`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.status).toBe("ok");
  });

  it("listen() returns handle with stop()", async () => {
    const port = 9500 + Math.floor(Math.random() * 100);
    const f = flow("test", { state: z.object({}) })
      .node("start", async (ctx) => ctx.reply("Hello!"));
    const app = createFlowPilot({ flows: [f], api: { port } });
    const handle = await app.listen();
    expect(handle.stop).toBeDefined();
    await handle.stop();
  });
});
