# TalkGraph

**TypeScript framework for production-grade conversational chatbots.**

Build customer service and sales chatbots with structured flows, LLM fallback, and zero infrastructure overhead. Define flows in code, get streaming events, multi-turn conversations, slot filling with validation, and built-in analytics out of the box.

## Why TalkGraph

- **Code-first** — Define flows in TypeScript with full type safety. No YAML, no config files, no graph DSL.
- **Streaming-native** — Everything is an async generator yielding typed events. No polling, no callbacks.
- **Zero infrastructure** — No Celery, no Redis, no external queue. One process, one `app.listen()`.
- **LLM-agnostic** — Native adapters for Anthropic, OpenAI, Google Gemini, Ollama + convenience adapters for OpenRouter, LiteLLM, and any OpenAI-compatible endpoint.
- **Convention over configuration** — Arrays auto-append, scalars auto-overwrite. No manual reducers.
- **Real HITL** — `ctx.prompt()` suspends the node mid-execution and resumes from the exact point. No node re-execution, no idempotency headaches.

## Quick Start

```bash
npm install @talkgraph/core
```

```typescript
import { createTalkGraph, flow } from "@talkgraph/core"
import { z } from "zod"

const support = flow("support", {
  state: z.object({
    name: z.string().optional(),
    issue: z.string().optional(),
  }),
})
  .node("greeting", async (ctx) => {
    const name = await ctx.prompt("Hi! What's your name?")
    return ctx.update({ name }).goto("collect_issue")
  })
  .node("collect_issue", async (ctx) => {
    const issue = await ctx.prompt(`Thanks ${ctx.state.name}! What can I help you with?`)
    return ctx.update({ issue }).goto("resolve")
  })
  .node("resolve", async (ctx) => {
    const response = await ctx.generate(
      `Help the customer with: ${ctx.state.issue}. Be concise and helpful.`
    )
    return ctx.reply(response)
  })
  .edge("greeting", "collect_issue")
  .edge("collect_issue", "resolve")

const app = createTalkGraph({
  flows: [support],
  api: { port: 3000 },
})

await app.listen()
```

Your bot is now running at `http://localhost:3000`.

## Features

### Flows & Nodes

```typescript
const vendas = flow("vendas", {
  state: z.object({ intent: z.string().optional() }),
})
  .node("start", async (ctx) => {
    const intent = await ctx.promptWithOptions("How can I help?", [
      { label: "Buy something", value: "buy" },
      { label: "Get support", value: "support" },
    ], { natural: true })
    return ctx.update({ intent }).goto(intent)
  })
  .edge("start", "buy", when("buy"))
  .edge("start", "support", when("support"))
```

### Slot Filling with Validation

```typescript
.node("collect_data", async (ctx) => {
  const data = await ctx.fillSlots({
    name: { prompt: "Your name?", validate: z.string().min(2) },
    cpf: {
      prompt: "Your CPF:",
      validate: z.string().regex(/^\d{11}$/),
      errorMessage: "Invalid CPF. Enter 11 digits.",
      maxAttempts: 3,
      onMaxAttempts: "human_fallback",
    },
    email: {
      prompt: "Email?",
      validate: z.string().email(),
      optional: true,
      skipKeyword: "skip",
    },
  })
  return ctx.update(data).goto("confirm")
})
```

### LLM Adapters

```typescript
import { AnthropicAdapter, OpenAIAdapter, OllamaAdapter } from "@talkgraph/core"

const app = createTalkGraph({
  flows: [myFlow],
  adapters: [
    new AnthropicAdapter({ apiKey: process.env.ANTHROPIC_API_KEY }),
    new OpenAIAdapter({ apiKey: process.env.OPENAI_API_KEY }),
    new OllamaAdapter({ baseUrl: "http://localhost:11434" }),
  ],
  defaultModel: "anthropic:claude-haiku-4-5",
  systemPrompt: "You are a helpful customer service agent.",
})
```

**Fallback chain** — if one provider is down, the next picks up automatically:

```typescript
import { FallbackChain } from "@talkgraph/core"

const chain = new FallbackChain({
  registry,
  chain: ["anthropic:claude-haiku-4-5", "openai:gpt-4o-mini", "ollama:llama3"],
  timeout: 10_000,
  staticResponses: {
    default: "I'm having technical difficulties. A human agent will help you shortly.",
  },
})
```

### Channels

```typescript
// REST API (built-in)
const app = createTalkGraph({ flows: [myFlow], api: { port: 3000 } })
await app.listen()

// WebSocket
import { WebChatAdapter } from "@talkgraph/core"
const webchat = new WebChatAdapter({ port: 3001, sessionManager, defaultFlow: "support" })
await webchat.start()
```

**REST API endpoints:**
- `POST /api/conversations` — Start a conversation
- `POST /api/conversations/:id/messages` — Send a message
- `GET /api/conversations/:id` — Get conversation status
- `DELETE /api/conversations/:id` — End conversation
- `GET /api/flows` — List available flows
- `GET /api/health` — Health check

### Guardrails

```typescript
import { piiGuard, rateLimiter } from "@talkgraph/core"

const app = createTalkGraph({
  flows: [myFlow],
  hooks: [
    piiGuard({
      detect: ["email", "creditCard", "cpf", "phone"],
      strategy: "redact", // "redact" | "mask" | "block"
      on: "before:llm",
    }),
    rateLimiter({
      max: 30,
      window: "1m",
      on: "before:turn",
    }),
  ],
})
```

### Hooks

```typescript
const app = createTalkGraph({
  hooks: [
    { on: "before:node", handler: async (ctx) => { /* log, validate, redirect */ } },
    { on: "after:llm", handler: async (ctx) => { /* filter, modify response */ } },
    { on: "before:turn", handler: async (ctx) => { /* rate limit, authenticate */ } },
  ],
})
```

Hooks can `modify`, `block`, or `redirect` — and they're error-isolated (one failing hook doesn't crash the flow).

### Analytics

```typescript
const engine = new AnalyticsEngine()

// Record events (automatic in production)
engine.record({ type: "flow:start", flowName: "vendas", sessionId: "s1", timestamp: Date.now() })

// Query metrics
const funnel = engine.funnel("vendas")
// → { steps: [{ node: "greeting", reached: 1200, dropoff: 0.02 }, ...], conversionRate: 0.52 }

const bottlenecks = engine.bottlenecks("vendas")
// → [{ node: "checkout", dropRate: 0.34, avgDuration: 4200 }]

const costs = engine.costBreakdown("vendas")
// → { totalCost: 12.50, avgPerConversation: 0.023, byModel: { "claude-haiku": 8.20 } }
```

### Testing

```typescript
import { simulate } from "@talkgraph/core"

const result = await simulate(vendas)
  .user("I want to buy something")
  .user("iPhone")
  .user("John Smith")
  .user("12345678900")
  .assertBotReplied(/order confirmed/i)
  .assertNodeReached("checkout")
  .assertState({ product: "iPhone" })
  .run()

expect(result.completedSuccessfully).toBe(true)
expect(result.errors).toHaveLength(0)
```

### Token Efficiency

```typescript
import { TokenManager, ContextCompactor, ResultLimiter } from "@talkgraph/core"

// Budget tracking
const tm = new TokenManager({
  budget: { maxTokensPerConversation: 100_000, maxCostPerConversation: 0.50 },
  compaction: { microCompactAt: 0.5, fullCompactAt: 0.7, circuitBreakerMax: 3 },
})

// Context compaction (dev chooses the model)
const compactor = new ContextCompactor({
  registry,
  model: "ollama:llama3", // any model, any provider
  preserveRecent: 5,
  preserveSlots: true, // never lose collected data
})

// Result size limiting
const limiter = new ResultLimiter({ maxCharsPerTool: 50_000, maxCharsPerTurn: 200_000 })
```

## Architecture

```
Developer API  →  Flow Compiler  →  Flow Runtime (async generator)
                                         │
                    ┌────────────┬────────┴────────┬─────────────┐
                    │            │                  │             │
               LLM Adapters  State Manager     Store         Hooks
              (7 providers)  (auto-reducers)  (pluggable)  (guardrails)
```

**Core principle:** The conversation loop is an async generator. Everything is a typed event — nodes, LLM tokens, tool results, prompts, state changes. One stream, full observability.

## Adapters

| Native (optimized) | Convenience (100+ models) |
|---|---|
| Anthropic (prompt caching, streaming) | OpenRouter (hosted models) |
| OpenAI (structured output, JSON mode) | LiteLLM (self-hosted proxy) |
| Google Gemini via Ollama (1M context) | Any OpenAI-compatible endpoint |
| Ollama (local, zero cost) | |

## Packages

| Package | Description | License |
|---------|-------------|---------|
| [`@talkgraph/core`](packages/core/) | Framework core — runtime, adapters, channels, tools, hooks | Apache 2.0 |
| [`@talkgraph/analytics`](packages/analytics/) | Conversational analytics — funnels, bottlenecks, cost tracking | FSL-1.1-Apache-2.0 |

## License

- **Core** (`@talkgraph/core`): [Apache 2.0](packages/core/LICENSE)
- **Analytics** (`@talkgraph/analytics`): [FSL 1.1](packages/analytics/LICENSE) — converts to Apache 2.0 on 2028-04-02

---

Built for developers who want to ship chatbots, not fight infrastructure.
