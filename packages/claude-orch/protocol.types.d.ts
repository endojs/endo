// Protocol types shared between orchestrator, client SDK, and the Endo
// caplet in @endo/claude-container. See ../claude-container/DESIGN.md
// §6 for the full protocol specification.

// =============================================================================
// Caller ↔ Orchestrator HTTP API (DESIGN.md §6.1)
// =============================================================================

export type Arch = 'x86_64' | 'aarch64';
export type NetworkMode = 'egress' | 'none';
export type AttachMode = 'stream' | 'none';
export type SessionState =
  | 'pending'
  | 'booting'
  | 'ready'
  | 'unhealthy'
  | 'terminated'
  | 'boot_failed';

export interface SessionResources {
  vcpus?: number;
  memMB?: number;
}

export interface CreateSessionRequest {
  arch?: Arch;
  resources?: SessionResources;
  network: NetworkMode;
  envExtra?: Record<string, string>;
  initialPrompt?: string;
  attachMode: AttachMode;
  /**
   * Optional caller-supplied credentials. When present, the
   * orchestrator uses these for the session's BootConfig instead
   * of consulting the broker (DESIGN.md §6.4). Lets a caller
   * holding a `ClaudeCredentials` cap (see
   * @endo/claude-container's R3) bypass the out-of-band broker
   * config file.
   */
  credentials?: Credentials;
}

export interface Session {
  id: string;
  state: SessionState;
  fsSocketPath: string;
  controlSocketPath: string;
  attachSocketPath?: string;
  createdAt: string;
}

export interface SessionSummary {
  id: string;
  state: SessionState;
  createdAt: string;
}

// =============================================================================
// Bootstrap RPC (Orchestrator ↔ Bootstrap Init, DESIGN.md §6.2)
//
// Transport: virtio-serial port `orchestrator`. Newline-delimited JSON.
// =============================================================================

export interface HelloMessage {
  type: 'hello';
  sessionId: string;
  bootNonce: string; // 256-bit hex
  agentVersion: string;
  hostname: string;
}

export interface Credentials {
  apiKey?: string;
  oauthToken?: { accessToken: string; expiresAt: string };
}

export interface BootConfigMessage {
  type: 'boot_config';
  credentials: Credentials;
  fsMountTag: string;
  workspaceUidGid: [number, number];
  envExtra: Record<string, string>;
  initialPrompt?: string;
  agentControlPort: string;
}

export type BootstrapMessage = HelloMessage | BootConfigMessage;

// =============================================================================
// Agent RPC (Orchestrator ↔ Runtime Agent, DESIGN.md §6.3)
//
// Transport: virtio-serial port `agent`. Newline-delimited JSON, bidirectional.
// =============================================================================

// Agent → Orchestrator
export interface AgentReady {
  type: 'ready';
  capabilities: string[];
}
export interface AgentHeartbeat {
  type: 'heartbeat';
  lastInputAt: string;
  cpuPct: number;
  memRss: number;
  idleSeconds: number;
}
export interface AgentLog {
  type: 'log';
  level: 'info' | 'warn' | 'error';
  msg: string;
  fields?: Record<string, unknown>;
}
export interface AgentExited {
  type: 'exited';
  reason: string;
  exitCode: number;
}
export type AgentToOrchMessage =
  | AgentReady
  | AgentHeartbeat
  | AgentLog
  | AgentExited;

// Orchestrator → Agent
export interface OrchAttach {
  type: 'attach';
  streamId: string;
}
export interface OrchDetach {
  type: 'detach';
  streamId: string;
}
export interface OrchRotateCreds {
  type: 'rotate_creds';
  credentials: Credentials;
}
export interface OrchExec {
  type: 'exec';
  cmd: string;
  argv: string[];
  timeoutMs: number;
  streamId: string;
}
export interface OrchTerminate {
  type: 'terminate';
  graceMs: number;
}
export type OrchToAgentMessage =
  | OrchAttach
  | OrchDetach
  | OrchRotateCreds
  | OrchExec
  | OrchTerminate;

// =============================================================================
// Credential Broker (DESIGN.md §6.4)
//
// Transport: UDS at /run/claude-orch/broker.sock, newline-delimited JSON.
// =============================================================================

export interface BrokerIssueRequest {
  type: 'issue';
  sessionId: string;
}
export interface BrokerRevokeRequest {
  type: 'revoke';
  sessionId: string;
}
export interface BrokerRotateRequest {
  type: 'rotate_if_needed';
  sessionId: string;
}
export type BrokerRequest =
  | BrokerIssueRequest
  | BrokerRevokeRequest
  | BrokerRotateRequest;

export interface BrokerCredsResponse {
  type: 'creds';
  credentials: Credentials;
}
export interface BrokerOkResponse {
  type: 'ok';
}
export interface BrokerNoopResponse {
  type: 'noop';
}
export interface BrokerErrorResponse {
  type: 'error';
  message: string;
}
export type BrokerResponse =
  | BrokerCredsResponse
  | BrokerOkResponse
  | BrokerNoopResponse
  | BrokerErrorResponse;

// =============================================================================
// Stdio multiplexing on the `stdio` virtio-serial port (DESIGN.md §6.3)
//
// Framing: <streamId:8 bytes><len:4 bytes BE><payload:len bytes>
// =============================================================================

export interface StdioFrame {
  streamId: string; // 8-char hex
  payload: Uint8Array;
}

// =============================================================================
// Internal orchestrator types (not on the wire)
// =============================================================================

export interface SessionRecord {
  id: string;
  state: SessionState;
  request: CreateSessionRequest;
  bootNonce: string;
  bootNonceUsed: boolean;
  vmPid?: number;
  sessionDir: string;
  fsSocketPath: string;
  ctlSocketPath: string;
  agentSocketPath: string;
  stdioSocketPath: string;
  qmpSocketPath: string;
  attachSocketPath: string;
  netAttachment?: NetAttachment;
  createdAt: string;
  readyAt?: string;
  terminatedAt?: string;
  failureReason?: string;
}

export interface NetworkOpts {
  mode: NetworkMode;
}

export interface NetAttachment {
  qemuArgs: string[];
  cleanup: () => Promise<void>;
}

export interface NetworkController {
  initialize(): Promise<void>;
  attachSession(sessionId: string, opts: NetworkOpts): Promise<NetAttachment>;
  detachSession(sessionId: string): Promise<void>;
  shutdown(): Promise<void>;
}

export interface OrchestratorConfig {
  socketPath: string;
  imageDir: string;
  sessionDir: string;
  brokerSocketPath: string;
  /** Path to the persisted sessions.json file used for restart-survival. */
  statePath?: string;
  defaults: {
    arch: Arch;
    vcpus: number;
    memMB: number;
  };
  bootDeadlineMs: number;
  heartbeatTimeoutMs: number;
}
