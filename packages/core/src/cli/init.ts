import * as fs from "fs";
import * as path from "path";

const DEFAULT_PACKAGE_JSON = (projectName: string) =>
  JSON.stringify(
    {
      name: projectName,
      version: "0.1.0",
      type: "module",
      scripts: {
        build: "tsc",
        start: "node dist/bot.js",
      },
      dependencies: {
        "@talkgraph/core": "^0.1.0",
      },
      devDependencies: {
        typescript: "^5.0.0",
        "@types/node": "^20.0.0",
      },
    },
    null,
    2
  );

const DEFAULT_BOT_TS = `import { TalkGraph } from "@talkgraph/core";

const bot = new TalkGraph({
  name: "my-bot",
  flows: [],
});

bot.start();
`;

const VENDAS_BOT_TS = `import { TalkGraph } from "@talkgraph/core";

const bot = new TalkGraph({
  name: "sales-bot",
  flows: [
    {
      id: "welcome",
      message: "Olá! Bem-vindo. Como posso ajudar você hoje?",
      transitions: [
        { on: "produto", goto: "produto-info" },
        { on: "preco", goto: "preco-info" },
      ],
    },
    {
      id: "produto-info",
      message: "Temos uma linha completa de produtos. Qual categoria te interessa?",
      transitions: [],
    },
    {
      id: "preco-info",
      message: "Nossos preços são competitivos. Posso te enviar uma proposta?",
      transitions: [],
    },
  ],
});

bot.start();
`;

const TSCONFIG_JSON = JSON.stringify(
  {
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      outDir: "dist",
      rootDir: "src",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
    },
    include: ["src/**/*"],
    exclude: ["node_modules", "dist"],
  },
  null,
  2
);

export async function handleInit(
  flags: Record<string, string>,
  targetDir: string = process.cwd()
): Promise<void> {
  const template = flags["template"];
  const projectName = path.basename(targetDir);

  const srcDir = path.join(targetDir, "src");
  fs.mkdirSync(srcDir, { recursive: true });

  fs.writeFileSync(path.join(targetDir, "package.json"), DEFAULT_PACKAGE_JSON(projectName));

  const botContent = template === "vendas" ? VENDAS_BOT_TS : DEFAULT_BOT_TS;
  fs.writeFileSync(path.join(srcDir, "bot.ts"), botContent);

  fs.writeFileSync(path.join(targetDir, "tsconfig.json"), TSCONFIG_JSON);

  const templateLabel = template ? ` (template: ${template})` : "";
  console.log(`TalkGraph project initialized${templateLabel}`);
  console.log(`  Created: package.json`);
  console.log(`  Created: src/bot.ts`);
  console.log(`  Created: tsconfig.json`);
  console.log(`\nNext steps:`);
  console.log(`  npm install`);
  console.log(`  npm run build`);
  console.log(`  npm start`);
}
