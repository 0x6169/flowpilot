#!/usr/bin/env node
import { parseArgs, formatHelp } from "./index.js";
import { handleInit } from "./init.js";
import { handleValidate } from "./validate.js";

const parsed = parseArgs(process.argv.slice(2));

switch (parsed.command) {
  case "help":
    console.log(formatHelp());
    break;
  case "init":
    await handleInit(parsed.flags);
    break;
  case "validate":
    await handleValidate();
    break;
  case "test":
    console.log("Run: npx vitest run");
    break;
  default:
    console.log(formatHelp());
}
