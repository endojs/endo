import type { Tool } from '@earendil-works/pi-ai';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { ToolRecord } from './types.js';

export declare const toPiAgentTool: (
  tool: ToolRecord,
  options?: { renderToolResult?: (result: unknown) => string },
) => AgentTool<Tool['parameters']>;
