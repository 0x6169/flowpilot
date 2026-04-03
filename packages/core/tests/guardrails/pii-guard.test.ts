import { describe, it, expect } from "vitest";
import { piiGuard } from "../../src/guardrails/pii-guard.js";

describe("piiGuard", () => {
  it("creates a HookDefinition with on and handler", () => {
    const hook = piiGuard();
    expect(hook).toHaveProperty("on");
    expect(hook).toHaveProperty("handler");
    expect(typeof hook.handler).toBe("function");
  });

  it("detects and redacts email by default", async () => {
    const hook = piiGuard({ strategy: "redact" });
    const result = await hook.handler({ text: "Contact me at john@example.com please" });
    expect(result).toEqual({ modify: { text: "Contact me at [REDACTED_EMAIL] please" } });
  });

  it("detects and redacts credit card numbers", async () => {
    const hook = piiGuard({ types: ["creditCard"], strategy: "redact" });
    const result = await hook.handler({ text: "My card is 4111 1111 1111 1111 thanks" });
    expect(result).toEqual({ modify: { text: "My card is [REDACTED_CREDITCARD] thanks" } });
  });

  it("detects and redacts CPF numbers", async () => {
    const hook = piiGuard({ types: ["cpf"], strategy: "redact" });
    const result = await hook.handler({ text: "My CPF is 123.456.789-09" });
    expect(result).toEqual({ modify: { text: "My CPF is [REDACTED_CPF]" } });
  });

  it("detects and redacts phone numbers", async () => {
    const hook = piiGuard({ types: ["phone"], strategy: "redact" });
    const result = await hook.handler({ text: "Call me at (11) 99999-1234" });
    expect(result).toEqual({ modify: { text: "Call me at [REDACTED_PHONE]" } });
  });

  it("masks PII keeping first 2 and last 2 chars", async () => {
    const hook = piiGuard({ types: ["email"], strategy: "mask" });
    const result = await hook.handler({ text: "Email: john@example.com" }) as { modify: { text: string } };
    expect(result).toHaveProperty("modify");
    // first 2 chars of "john@example.com" are "jo", last 2 are "om"
    expect(result.modify.text).toContain("jo****om");
  });

  it("blocks when strategy is block and PII is found", async () => {
    const hook = piiGuard({ strategy: "block" });
    const result = await hook.handler({ text: "My email is test@test.com" });
    expect(result).toEqual({ block: "PII detected" });
  });

  it("returns undefined when no PII is found", async () => {
    const hook = piiGuard();
    const result = await hook.handler({ text: "Hello, how are you today?" });
    expect(result).toBeUndefined();
  });
});
