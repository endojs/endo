import type {
  EdgeName,
  EndoGuest,
  NamePath,
  NameOrPath,
  StampedMessage,
} from '@endo/daemon/src/types.js';

export type { NameOrPath };

export type ToolParameterProperty = {
  type?: string;
  description?: string;
  items?: { type: string };
  oneOf?: Array<{ type: string; items?: { type: string } }>;
};

export type ToolParameters = {
  type: 'object';
  properties: Record<string, ToolParameterProperty>;
  required: string[];
};

export type ToolFunction = {
  name: string;
  description: string;
  parameters: ToolParameters;
};

export type Tool = {
  type: 'function';
  function: ToolFunction;
};

export type ToolCall = {
  id?: string;
  function: {
    name: string;
    arguments: Record<string, unknown> | string;
  };
};

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};

export type ToolResult = {
  role: 'tool';
  content: string;
  tool_call_id?: string;
};

export type ToolCallArgs = {
  methodName?: string;
  petNamePath?: NamePath;
  petNameOrPath?: NameOrPath;
  fromPath?: NamePath;
  toPath?: NamePath;
  messageNumber?: number;
  reason?: string;
  edgeName?: NameOrPath;
  petName?: NameOrPath;
  recipientName?: NameOrPath;
  description?: string;
  responseName?: NameOrPath;
  strings?: string[];
  edgeNames?: EdgeName[];
  petNames?: NameOrPath[];
  workerName?: string;
  source?: string;
  codeNames?: string[];
  resultName?: NameOrPath;
};

export type InboxMessage = StampedMessage;
export type GuestPowers = EndoGuest;

export type PendingProposal = {
  proposalId: number;
  source: string;
  codeNames: string[];
  edgeNames: EdgeName[];
  workerName?: string;
  promise: Promise<unknown>;
};

export type ProposalNotification = {
  status: 'granted' | 'rejected';
  proposalId: number;
  source: string;
  result?: unknown;
  error?: string;
};
