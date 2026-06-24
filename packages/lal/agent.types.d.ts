import type {
  Name,
  EndoGuest,
  NamePath,
  NameOrPath,
  StampedMessage,
} from '@endo/daemon';

export type { NameOrPath };

/**
 * Arguments passed into the tool dispatcher in `agent.js`. pi-agent-core
 * delivers tool arguments as already-parsed JSON objects; SmallCaps
 * interpretation is applied only to per-tool `bigintArgs` fields (the
 * documented `messageNumber` surface), so BigInt-shaped strings like
 * "+5" round-trip into `messageNumber` as actual BigInts while every
 * other string field arrives verbatim from the LLM.
 */
export type ToolCallArgs = {
  methodName?: string;
  // `name` is the optional argument to the `list` tool when called against a
  // capability other than the guest's own root directory.
  name?: NameOrPath;
  petNamePath?: NamePath;
  petNameOrPath?: NameOrPath;
  fromPath?: NamePath;
  toPath?: NamePath;
  messageNumber?: number | bigint;
  reason?: string;
  edgeName?: NameOrPath;
  petName?: NameOrPath;
  recipientName?: NameOrPath;
  description?: string;
  responseName?: NameOrPath;
  strings?: string[];
  edgeNames?: Name[];
  petNames?: NameOrPath[];
  workerName?: string;
  source?: string;
  codeNames?: string[];
  resultName?: NameOrPath;
  fileName?: string;
  content?: string;
  slots?: Record<string, { label: string }>;
};

export type InboxMessage = StampedMessage;
export type GuestPowers = EndoGuest;

/** Configuration for a worker spawned from a form submission */
export type WorkerConfig = {
  name: string;
  host: string;
  model: string;
  authToken: string;
};

/** Context object for cancellation support */
export type LalContext = {
  whenCancelled?: () => Promise<void>;
  cancelled?: Promise<void>;
};
