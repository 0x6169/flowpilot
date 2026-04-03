import { describe, it, expect } from "vitest";
import { defineTool } from "../src/tools/define.js";
import { ToolExecutor } from "../src/tools/executor.js";
import { z } from "zod";

describe("defineTool", () => {
  it("creates a tool with validated input/output schemas", () => {
    const tool = defineTool({
      name: "greet",
      description: "Greets a person",
      input: z.object({ name: z.string() }),
      output: z.object({ message: z.string() }),
      concurrent: true,
      async execute(input) {
        return { message: `Hello, ${input.name}!` };
      },
    });
    expect(tool.name).toBe("greet");
    expect(tool.concurrent).toBe(true);
  });

  it("validates input before execution", async () => {
    const tool = defineTool({
      name: "greet",
      description: "Greets",
      input: z.object({ name: z.string() }),
      output: z.object({ message: z.string() }),
      concurrent: true,
      async execute(input) {
        return { message: `Hello, ${input.name}!` };
      },
    });
    await expect(tool.run({ name: 123 } as any)).rejects.toThrow();
  });

  it("validates output after execution", async () => {
    const tool = defineTool({
      name: "bad",
      description: "Returns wrong type",
      input: z.object({}),
      output: z.object({ count: z.number() }),
      concurrent: true,
      async execute() {
        return { count: "not a number" } as any;
      },
    });
    await expect(tool.run({})).rejects.toThrow();
  });

  it("executes successfully with valid input/output", async () => {
    const tool = defineTool({
      name: "add",
      description: "Adds two numbers",
      input: z.object({ a: z.number(), b: z.number() }),
      output: z.object({ sum: z.number() }),
      concurrent: true,
      async execute(input) {
        return { sum: input.a + input.b };
      },
    });
    const result = await tool.run({ a: 2, b: 3 });
    expect(result).toEqual({ sum: 5 });
  });
});

describe("ToolExecutor", () => {
  function makeTool(name: string, concurrent: boolean, delayMs: number, result: unknown) {
    return defineTool({
      name,
      description: name,
      input: z.object({}),
      output: z.any(),
      concurrent,
      async execute() {
        await new Promise((r) => setTimeout(r, delayMs));
        return result;
      },
    });
  }

  it("runs concurrent tools in parallel", async () => {
    const t1 = makeTool("t1", true, 50, { v: 1 });
    const t2 = makeTool("t2", true, 50, { v: 2 });
    const executor = new ToolExecutor([t1, t2]);
    const start = Date.now();
    const results = await executor.runAll([
      { toolName: "t1", input: {} },
      { toolName: "t2", input: {} },
    ]);
    const elapsed = Date.now() - start;
    expect(results).toHaveLength(2);
    expect(results[0].output).toEqual({ v: 1 });
    expect(results[1].output).toEqual({ v: 2 });
    expect(elapsed).toBeLessThan(90);
  });

  it("runs serial tools one at a time", async () => {
    const t1 = makeTool("t1", false, 50, { v: 1 });
    const t2 = makeTool("t2", false, 50, { v: 2 });
    const executor = new ToolExecutor([t1, t2]);
    const start = Date.now();
    const results = await executor.runAll([
      { toolName: "t1", input: {} },
      { toolName: "t2", input: {} },
    ]);
    const elapsed = Date.now() - start;
    expect(results).toHaveLength(2);
    expect(elapsed).toBeGreaterThanOrEqual(90);
  });

  it("partitions mixed concurrent/serial tools correctly", async () => {
    const c1 = makeTool("c1", true, 50, { v: "c1" });
    const s1 = makeTool("s1", false, 50, { v: "s1" });
    const c2 = makeTool("c2", true, 50, { v: "c2" });
    const executor = new ToolExecutor([c1, s1, c2]);
    const results = await executor.runAll([
      { toolName: "c1", input: {} },
      { toolName: "s1", input: {} },
      { toolName: "c2", input: {} },
    ]);
    expect(results.map((r) => r.output)).toEqual([
      { v: "c1" },
      { v: "s1" },
      { v: "c2" },
    ]);
  });

  it("throws on unknown tool name", async () => {
    const executor = new ToolExecutor([]);
    await expect(
      executor.runAll([{ toolName: "ghost", input: {} }]),
    ).rejects.toThrow(/ghost/);
  });
});
