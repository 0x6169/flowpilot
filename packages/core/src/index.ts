export { flow, when, FlowBuilder } from "./flow.js";
export { compile } from "./compiler.js";
export { runConversation } from "./runtime.js";
export { createFlowPilot, FlowPilotApp } from "./app.js";
export { ConversationContextImpl } from "./context.js";
export { Conversation } from "./conversation.js";
export type { ConversationConfig, ConversationStatus } from "./conversation.js";
export { StateManager } from "./state.js";
export { defineTool } from "./tools/define.js";
export { ToolExecutor } from "./tools/executor.js";
export { MockLLMAdapter } from "./llm/mock.js";
export { AdapterRegistry } from "./llm/registry.js";
export { SystemPromptBuilder } from "./llm/prompts.js";
export { FallbackChain } from "./llm/fallback.js";
export { AnthropicAdapter } from "./llm/anthropic.js";
export { OpenAIAdapter } from "./llm/openai.js";
export { OllamaAdapter } from "./llm/ollama.js";
export { OpenAICompatibleAdapter } from "./llm/openai-compatible.js";

export { EventChannel } from "./event-channel.js";
export { InMemoryStore } from "./store/memory-store.js";
export type { SessionSnapshot, PendingPrompt, ConversationStore, MemoryItem, MemoryStore } from "./store/types.js";

export { SessionManager } from "./channels/session-manager.js";
export { RestApiAdapter } from "./channels/rest-api.js";
export { WebChatAdapter } from "./channels/webchat.js";
export type { InboundMessage, OutboundMessage, ChannelCapabilities, ChannelAdapter, ChannelHandler } from "./channels/types.js";

export { HookRunner } from "./hooks/runner.js";
export { piiGuard } from "./guardrails/pii-guard.js";
export { rateLimiter } from "./guardrails/rate-limiter.js";
export { TokenCounter } from "./tokens/counter.js";
export { ResultLimiter } from "./tokens/result-limiter.js";
export { ContextCompactor } from "./tokens/compactor.js";
export { TokenManager } from "./tokens/manager.js";

export { FlowError, CompileError, RuntimeError, ToolError } from "./errors.js";
export { END } from "./types.js";

export type {
  FlowEvent,
  NodeResult,
  NodeHandler,
  NodeDefinition,
  NodeConfig,
  EdgeDefinition,
  EdgeCondition,
  HookEvent,
  HookDefinition,
  HookResult,
  Option,
  FlowDefinition,
  FlowConfig,
  CompiledFlow,
  Session,
  ConversationMessage,
  ConversationContext,
  TokenUsage,
  SlotDefinition,
} from "./types.js";

export type {
  LLMAdapter,
  LLMRequest,
  LLMResponse,
  LLMEvent,
} from "./llm/types.js";

export type {
  ToolDefinition,
  ToolCallRequest,
  ToolCallResult,
} from "./tools/types.js";

// Testing
export { simulate } from "./testing/simulate.js";
export type { SimulationResult } from "./testing/types.js";

// CLI
export { parseArgs, formatHelp } from "./cli/index.js";

export const VERSION = "0.1.0";
