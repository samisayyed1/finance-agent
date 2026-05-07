/**
 * Public types for the testable agent transport. Production wires this to
 * Claude Agent SDK + MCP; tests inject deterministic fakes.
 */

export interface ToolDescriptor {
  description: string;
  name: string;
  /** JSON-Schema-shaped parameters object. */
  parameters: Record<string, unknown>;
}

export interface ToolCallResult {
  input: unknown;
  latencyMs: number;
  output: unknown;
  tool: string;
}

export interface AgentTransportInput {
  /**
   * Implementation invokes this for each tool call the model issues. Provided
   * by the agent runtime; the transport must not call tools directly.
   */
  invokeTool: (toolName: string, input: unknown) => Promise<unknown>;
  /** Optional max-iterations cap to prevent runaway loops. */
  maxIterations?: number;
  model: string;
  systemPrompt: string;
  tools: ToolDescriptor[];
  userMessage: string;
}

export interface AgentTransportOutput {
  /** The final assistant message (must be the JSON DailyReport for our path). */
  finalMessage: string;
  inputTokens?: number;
  outputTokens?: number;
  toolCalls: ToolCallResult[];
}

/**
 * The pluggable boundary. Production `runWithAnthropic` wires this to the
 * real Claude Agent SDK; tests pass a fake that replays a recorded sequence.
 */
export type AgentTransport = (
  input: AgentTransportInput
) => Promise<AgentTransportOutput>;
