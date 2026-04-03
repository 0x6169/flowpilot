import { describe, it, expect } from "vitest";
import { parseArgs, formatHelp } from "../../src/cli/index.js";

describe("CLI", () => {
  it("parses 'validate' command", () => {
    const result = parseArgs(["validate"]);
    expect(result.command).toBe("validate");
  });

  it("parses 'test' command", () => {
    const result = parseArgs(["test"]);
    expect(result.command).toBe("test");
  });

  it("parses 'init' command", () => {
    const result = parseArgs(["init"]);
    expect(result.command).toBe("init");
  });

  it("parses 'init' with --template flag", () => {
    const result = parseArgs(["init", "--template", "vendas"]);
    expect(result.command).toBe("init");
    expect(result.flags.template).toBe("vendas");
  });

  it("returns help for unknown command", () => {
    const result = parseArgs(["unknown"]);
    expect(result.command).toBe("help");
  });

  it("returns help for no args", () => {
    const result = parseArgs([]);
    expect(result.command).toBe("help");
  });

  it("formatHelp returns help text", () => {
    const help = formatHelp();
    expect(help).toContain("flowpilot");
    expect(help).toContain("init");
    expect(help).toContain("validate");
    expect(help).toContain("test");
  });
});
