// Public types for the @endo/jsonl-transcript package.
//
// This package projects an Endo/Lal reply-chain transcript graph to and from
// the append-only, Pi-compatible JSONL session file described in
// `docs/session-format.md`. The declarations here name the on-disk entry
// shapes, the in-memory graph, and the injectable filesystem seam the writer
// stands on. The source modules pull them in with `@import ... from
// '../types.js'`; the adjacent `types.js` is the empty JavaScript counterpart
// that specifier resolves to.

/**
 * The standard Pi/OpenAI chat roles. A message whose role is outside this set
 * projects to a `custom` entry (Pi's extension slot) rather than a `message`.
 */
export type Role = 'system' | 'user' | 'assistant' | 'tool';

/**
 * A Pi-compatible chat message: a `role` (standard or foreign), `content` (a
 * string or an array of content blocks), and any provider metadata (`api`,
 * `provider`, `model`, `usage`, `stopReason`, `timestamp`, …).
 */
export interface ChatMessage {
  role: string;
  content: unknown;
  [key: string]: unknown;
}

/**
 * The first line of a session file. `cwd` and `endo:guestId` are the optional
 * Pi/Endo provenance fields documented in `docs/session-format.md`.
 */
export interface HeaderEntry {
  type: 'header';
  version: number;
  sessionId: string;
  createdAt: number;
  cwd?: string;
  'endo:guestId'?: string;
}

/** One LLM message, addressable by `id` and linked to its parent by `parentId`. */
export interface MessageEntry {
  type: 'message';
  id: string;
  parentId: string | null;
  message: ChatMessage;
  'endo:messageId'?: string;
  'endo:parentMessageId'?: string | null;
}

/** A Pi-foreign message kind, carried in the `custom` extension slot. */
export interface CustomEntry {
  type: 'custom';
  id: string;
  parentId: string | null;
  custom: { 'endo:kind': string; [key: string]: unknown };
}

/** A non-header entry: everything that carries an `id`/`parentId` link. */
export type NodeEntry = MessageEntry | CustomEntry;

/** Any line of a session file. */
export type SessionEntry = HeaderEntry | NodeEntry;

/** The result of parsing a session file's raw text. */
export interface ParseResult {
  entries: SessionEntry[];
  trailingPartial: string;
}

/** The transcript graph reconstructed from a session file. */
export interface SessionGraph {
  header: HeaderEntry | null;
  entries: SessionEntry[];
  byId: Map<string, NodeEntry>;
  childIds: Map<string | null, string[]>;
}

/**
 * An in-memory Lal transcript node: several LLM messages bundled under one
 * daemon `messageId`, linked to a parent node by `parentMessageId`.
 */
export interface TranscriptNode {
  messageId: string;
  parentMessageId: string | null;
  messages: ChatMessage[];
}

/** The on-disk linkage fields for a projected message entry. */
export interface MessageLinkage {
  id: string;
  parentId: string | null;
  'endo:messageId'?: string;
  'endo:parentMessageId'?: string | null;
}

/** The minimal append-only file handle the writer drives. */
export interface WriterFileHandle {
  write(data: string): Promise<unknown>;
  close(): Promise<void>;
}

/** The injectable filesystem seam the session writer stands on. */
export interface WriterFs {
  mkdir(
    path: string,
    options: { recursive: boolean; mode?: number },
  ): Promise<unknown>;
  readFile(path: string): Promise<Uint8Array>;
  truncate(path: string, length: number): Promise<unknown>;
  open(path: string, flags: string, mode: number): Promise<WriterFileHandle>;
}

/** An append-only, Pi-compatible JSONL session writer. */
export interface SessionWriter {
  writeHeader(
    fields: Omit<HeaderEntry, 'type' | 'version'> & { version?: number },
  ): Promise<void>;
  append(entry: SessionEntry): Promise<void>;
  appendMessage(
    message: ChatMessage,
    linkage: MessageLinkage,
  ): Promise<MessageEntry>;
  close(): Promise<void>;
}
