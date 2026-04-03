import * as fs from "fs";
import * as path from "path";

function findTsFiles(dir: string): string[] {
  const results: string[] = [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== "dist") {
      results.push(...findTsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      results.push(fullPath);
    }
  }

  return results;
}

export async function handleValidate(targetDir: string = process.cwd()): Promise<void> {
  console.log("Validation: looking for flow definitions...");

  const tsFiles = findTsFiles(targetDir);
  const flowpilotFiles = tsFiles.filter((file) => {
    try {
      const content = fs.readFileSync(file, "utf-8");
      return content.includes("@flowpilot/core");
    } catch {
      return false;
    }
  });

  if (flowpilotFiles.length === 0) {
    console.log("No files importing from @flowpilot/core found.");
  } else {
    console.log(`Found ${flowpilotFiles.length} file(s) importing from @flowpilot/core:`);
    for (const file of flowpilotFiles) {
      console.log(`  ${path.relative(targetDir, file)}`);
    }
  }
}
