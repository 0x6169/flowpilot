import { describe, it, expect } from "vitest";
import { InMemoryStore } from "../../src/store/memory-store.js";

describe("InMemoryStore (ConversationStore)", () => {
  it("saves and loads a session", async () => {
    const store = new InMemoryStore();
    await store.connect();
    const snapshot = {
      sessionId: "s1", flowName: "test", currentNode: "start",
      state: { name: "Alice" }, messages: [], pendingPrompt: null,
      turn: 1, createdAt: Date.now(), updatedAt: Date.now(),
    };
    await store.save(snapshot);
    const loaded = await store.load("s1");
    expect(loaded?.sessionId).toBe("s1");
    expect(loaded?.state.name).toBe("Alice");
  });

  it("returns null for missing session", async () => {
    const store = new InMemoryStore();
    await store.connect();
    expect(await store.load("ghost")).toBeNull();
  });

  it("deletes a session", async () => {
    const store = new InMemoryStore();
    await store.connect();
    await store.save({
      sessionId: "s1", flowName: "test", currentNode: "start",
      state: {}, messages: [], pendingPrompt: null,
      turn: 1, createdAt: Date.now(), updatedAt: Date.now(),
    });
    await store.delete("s1");
    expect(await store.load("s1")).toBeNull();
  });

  it("lists sessions", async () => {
    const store = new InMemoryStore();
    await store.connect();
    await store.save({
      sessionId: "s1", flowName: "flow1", currentNode: "a",
      state: {}, messages: [], pendingPrompt: null,
      turn: 1, createdAt: 100, updatedAt: 200,
    });
    await store.save({
      sessionId: "s2", flowName: "flow2", currentNode: "b",
      state: {}, messages: [], pendingPrompt: null,
      turn: 2, createdAt: 300, updatedAt: 400,
    });
    const list = await store.list();
    expect(list).toHaveLength(2);
  });
});

describe("InMemoryStore (MemoryStore)", () => {
  it("sets and gets memory", async () => {
    const store = new InMemoryStore();
    await store.set("user1", "profile", "name", "Alice");
    const item = await store.get("user1", "profile", "name");
    expect(item?.value).toBe("Alice");
  });

  it("returns null for missing memory", async () => {
    const store = new InMemoryStore();
    expect(await store.get("user1", "ns", "key")).toBeNull();
  });

  it("deletes memory", async () => {
    const store = new InMemoryStore();
    await store.set("user1", "ns", "key", "val");
    await store.deleteMemory("user1", "ns", "key");
    expect(await store.get("user1", "ns", "key")).toBeNull();
  });

  it("lists memory in namespace", async () => {
    const store = new InMemoryStore();
    await store.set("user1", "profile", "name", "Alice");
    await store.set("user1", "profile", "email", "alice@test.com");
    await store.set("user1", "prefs", "theme", "dark");
    const items = await store.listMemory("user1", "profile");
    expect(items).toHaveLength(2);
  });

  it("respects TTL", async () => {
    const store = new InMemoryStore();
    await store.set("user1", "ns", "key", "val", 0);
    await new Promise(r => setTimeout(r, 10));
    expect(await store.get("user1", "ns", "key")).toBeNull();
  });
});
