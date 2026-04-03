// src/errors.ts
export class FlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FlowError";
  }
}

export class CompileError extends FlowError {
  constructor(
    message: string,
    public readonly flowName: string,
  ) {
    super(`[${flowName}] ${message}`);
    this.name = "CompileError";
  }
}

export class RuntimeError extends FlowError {
  constructor(
    message: string,
    public readonly sessionId: string,
    public readonly nodeName?: string,
  ) {
    super(message);
    this.name = "RuntimeError";
  }
}

export class ToolError extends Error {
  constructor(
    message: string,
    public readonly toolName?: string,
  ) {
    super(message);
    this.name = "ToolError";
  }
}
