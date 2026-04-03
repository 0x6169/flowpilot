export interface InboundMessage {
  sessionId: string;
  text: string;
  userId?: string;
  channel: string;
  timestamp: number;
}

export type OutboundMessage =
  | { type: "text"; text: string }
  | { type: "options"; text: string; options: Array<{ label: string; value: string }> }
  | { type: "typing"; duration?: number }
  | { type: "end"; reason?: string };

export interface ChannelCapabilities {
  richText: boolean;
  buttons: boolean;
  images: boolean;
  quickReplies: boolean;
  typingIndicator: boolean;
}

export type ChannelHandler = (message: InboundMessage) => AsyncGenerator<OutboundMessage>;

export interface ChannelAdapter {
  name: string;
  capabilities: ChannelCapabilities;
  start(): Promise<void>;
  stop(): Promise<void>;
}
