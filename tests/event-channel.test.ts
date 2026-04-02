import { describe, it, expect } from "vitest";
import { EventChannel } from "../src/event-channel.js";

describe("EventChannel", () => {
  it("pushes and drains events", () => {
    const ch = new EventChannel<string>();
    ch.push("a");
    ch.push("b");
    expect(ch.drain()).toEqual(["a", "b"]);
    expect(ch.drain()).toEqual([]);
  });

  it("reports pending state", () => {
    const ch = new EventChannel<string>();
    expect(ch.hasPending()).toBe(false);
    ch.push("a");
    expect(ch.hasPending()).toBe(true);
    ch.drain();
    expect(ch.hasPending()).toBe(false);
  });

  it("waitForEvent resolves when event is pushed", async () => {
    const ch = new EventChannel<string>();
    const promise = ch.waitForEvent();
    ch.push("hello");
    const result = await promise;
    expect(result).toBe("hello");
  });

  it("waitForEvent resolves immediately if event already pending", async () => {
    const ch = new EventChannel<string>();
    ch.push("already-here");
    const result = await ch.waitForEvent();
    expect(result).toBe("already-here");
  });
});
