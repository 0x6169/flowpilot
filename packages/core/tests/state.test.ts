import { describe, it, expect } from "vitest";
import { StateManager } from "../src/state.js";
import { z } from "zod";

const schema = z.object({
  name: z.string().optional(),
  count: z.number().default(0),
  tags: z.array(z.string()).default([]),
});

describe("StateManager", () => {
  it("creates initial state from Zod schema defaults", () => {
    const sm = new StateManager(schema);
    const state = sm.getInitialState();
    expect(state).toEqual({ count: 0, tags: [] });
  });

  it("applies scalar updates by overwriting", () => {
    const sm = new StateManager(schema);
    const state = sm.getInitialState();
    const next = sm.apply(state, { name: "Alice" });
    expect(next.name).toBe("Alice");
  });

  it("applies array updates by appending", () => {
    const sm = new StateManager(schema);
    const state = sm.getInitialState();
    const s1 = sm.apply(state, { tags: ["a"] });
    expect(s1.tags).toEqual(["a"]);
    const s2 = sm.apply(s1, { tags: ["b"] });
    expect(s2.tags).toEqual(["a", "b"]);
  });

  it("overwrites scalar even if already set", () => {
    const sm = new StateManager(schema);
    const state = sm.getInitialState();
    const s1 = sm.apply(state, { name: "Alice" });
    const s2 = sm.apply(s1, { name: "Bob" });
    expect(s2.name).toBe("Bob");
  });

  it("uses custom reducer when provided", () => {
    const sm = new StateManager(schema, {
      count: (current, update) => (current as number) + (update as number),
    });
    const state = sm.getInitialState();
    const s1 = sm.apply(state, { count: 5 });
    const s2 = sm.apply(s1, { count: 3 });
    expect(s2.count).toBe(8);
  });

  it("validates state against schema", () => {
    const strict = z.object({ name: z.string() });
    const sm = new StateManager(strict);
    expect(() => sm.validate({ name: 123 } as any)).toThrow();
  });

  it("returns immutable state (shallow freeze)", () => {
    const sm = new StateManager(schema);
    const state = sm.getInitialState();
    const frozen = sm.freeze(state);
    expect(() => {
      (frozen as any).count = 99;
    }).toThrow();
  });
});
