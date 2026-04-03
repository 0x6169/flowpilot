import type { FlowEvent } from "../types.js";

export interface SimulationResult {
  completedSuccessfully: boolean;
  turns: number;
  events: FlowEvent[];
  finalState: Record<string, unknown>;
  errors: string[];
}
