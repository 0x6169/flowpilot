import type { ConversationMessage } from "../llm/types.js";
import { AdapterRegistry } from "../llm/registry.js";

export interface ContextCompactorOptions {
  registry: AdapterRegistry;
  model: string;
  preserveRecent: number;
  preserveSlots?: boolean;
}

export interface CompactionResult {
  messages: ConversationMessage[];
  compacted: boolean;
  tokensBefore: number;
  tokensAfter: number;
}

function estimateTokens(messages: ConversationMessage[]): number {
  return messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
}

export class ContextCompactor {
  private readonly registry: AdapterRegistry;
  private readonly model: string;
  private readonly preserveRecent: number;
  private readonly preserveSlots: boolean;

  constructor(options: ContextCompactorOptions) {
    this.registry = options.registry;
    this.model = options.model;
    this.preserveRecent = options.preserveRecent;
    this.preserveSlots = options.preserveSlots ?? false;
  }

  async compact(
    messages: ConversationMessage[],
    slotData?: Record<string, string>,
  ): Promise<CompactionResult> {
    const tokensBefore = estimateTokens(messages);

    // Nothing to compact if total messages fit within preserveRecent
    if (messages.length <= this.preserveRecent) {
      return {
        messages,
        compacted: false,
        tokensBefore,
        tokensAfter: tokensBefore,
      };
    }

    const oldMessages = messages.slice(0, messages.length - this.preserveRecent);
    const recentMessages = messages.slice(messages.length - this.preserveRecent);

    // Build summarization prompt
    const transcript = oldMessages
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");

    const { adapter } = this.registry.resolveWithModel(this.model);
    const response = await adapter.complete({
      model: this.model,
      messages: [
        {
          role: "user",
          content: `Summarize the following conversation concisely, preserving key information:\n\n${transcript}`,
        },
      ],
    });

    let summaryContent = response.content;

    // Append slot data if configured and provided
    if (this.preserveSlots && slotData && Object.keys(slotData).length > 0) {
      const slotLines = Object.entries(slotData)
        .map(([key, value]) => `${key}: ${value}`)
        .join("\n");
      summaryContent = `${summaryContent}\n\nCollected data:\n${slotLines}`;
    }

    const summaryMessage: ConversationMessage = {
      role: "system",
      content: summaryContent,
    };

    const compactedMessages: ConversationMessage[] = [summaryMessage, ...recentMessages];
    const tokensAfter = estimateTokens(compactedMessages);

    return {
      messages: compactedMessages,
      compacted: true,
      tokensBefore,
      tokensAfter,
    };
  }
}
