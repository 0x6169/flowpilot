interface ParsedArgs {
  command: string;
  flags: Record<string, string>;
  args: string[];
}

const COMMANDS = ["init", "validate", "test", "dev", "inspect", "replay", "stats", "help"];

export function parseArgs(argv: string[]): ParsedArgs {
  const flags: Record<string, string> = {};
  const args: string[] = [];
  let command = "help";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (i === 0 && !arg.startsWith("-")) {
      command = COMMANDS.includes(arg) ? arg : "help";
      continue;
    }
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = "true";
      }
    } else {
      args.push(arg);
    }
  }

  return { command, flags, args };
}

export function formatHelp(): string {
  return `
flowpilot — TypeScript framework for conversational chatbots

Usage:
  npx flowpilot <command> [options]

Commands:
  init [--template <name>]    Scaffold a new FlowPilot project
  validate                    Validate all flows (cycles, orphan nodes, types)
  test                        Run flow simulation tests
  dev                         Start dev server with hot-reload
  inspect                     Open graph inspector in browser
  replay <sessionId>          Replay a conversation step-by-step
  stats <flow> [--period <d>] Show flow metrics

Options:
  --help                      Show this help message
`.trim();
}
