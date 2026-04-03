import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { handleInit } from "../../src/cli/init.js";

describe("handleInit", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "talkgraph-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates package.json in target directory", async () => {
    await handleInit({}, tmpDir);

    const pkgPath = path.join(tmpDir, "package.json");
    expect(fs.existsSync(pkgPath)).toBe(true);
  });

  it("creates src/bot.ts in target directory", async () => {
    await handleInit({}, tmpDir);

    const botPath = path.join(tmpDir, "src", "bot.ts");
    expect(fs.existsSync(botPath)).toBe(true);
  });

  it("creates tsconfig.json in target directory", async () => {
    await handleInit({}, tmpDir);

    const tsconfigPath = path.join(tmpDir, "tsconfig.json");
    expect(fs.existsSync(tsconfigPath)).toBe(true);
  });

  it("generated package.json is valid JSON", async () => {
    await handleInit({}, tmpDir);

    const pkgPath = path.join(tmpDir, "package.json");
    const raw = fs.readFileSync(pkgPath, "utf-8");
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it("generated package.json includes @talkgraph/core dependency", async () => {
    await handleInit({}, tmpDir);

    const pkgPath = path.join(tmpDir, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    expect(pkg.dependencies).toHaveProperty("@talkgraph/core");
  });

  it("generated tsconfig.json is valid JSON", async () => {
    await handleInit({}, tmpDir);

    const tsconfigPath = path.join(tmpDir, "tsconfig.json");
    const raw = fs.readFileSync(tsconfigPath, "utf-8");
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it("creates default bot without template flag", async () => {
    await handleInit({}, tmpDir);

    const botPath = path.join(tmpDir, "src", "bot.ts");
    const content = fs.readFileSync(botPath, "utf-8");
    expect(content).toContain("@talkgraph/core");
    expect(content).not.toContain("sales-bot");
  });

  it("creates sales bot template with --template vendas", async () => {
    await handleInit({ template: "vendas" }, tmpDir);

    const botPath = path.join(tmpDir, "src", "bot.ts");
    const content = fs.readFileSync(botPath, "utf-8");
    expect(content).toContain("sales-bot");
    expect(content).toContain("Olá");
  });
});
