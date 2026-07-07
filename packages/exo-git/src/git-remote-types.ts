export type GitDirection = 'fetch' | 'push';

/**
 * The reusable "authority to talk to this remote" half of a
 * GitRemote.
 *
 * `GitRemote` composes `GitRemoteEndpoint` with an existing `Git`, and
 * clone composes `GitRemoteEndpoint` with an empty destination mount.
 * This is host-private because `ensureCredentialUsable()` exposes
 * native credential material.
 */
export type GitRemoteEndpoint = {
  url: string;
  origin: string;
  protocol: string;
  requiresCredential: boolean;
  allowLocalFileTransport: boolean;
  ensureCredentialUsable: () =>
    | { kind: string; material: unknown }
    | undefined;
  captureCredentialVersion: () => number | undefined;
  assertCredentialUnchanged: (
    operation: string,
    version: number | undefined,
  ) => void;
  watchChange: (onChange: () => void) => void;
};

export type GitRemotePolicy = {
  /**
   * Host-controlled remote endpoint URL. Guests cannot mutate this
   * field at call time; only `GitRemoteController.revoke()` or future
   * controller methods adjust the binding.
   */
  url: string;
  allowedDirections: GitDirection[];
  fetchRefspecs: string[];
  pushRefspecs: string[];
  allowedBranches?: string[];
  allowForcePush?: boolean;
  allowTags?: boolean;
  allowDelete?: boolean;
  allowLocalFileTransport?: boolean;
};

export type GitRemoteAuditEventBase = {
  sequence: number;
};

export type GitRemotePolicyAuditEvent = GitRemoteAuditEventBase & {
  type: 'create' | 'revoke' | 'policy';
  policy: GitRemotePolicy & { name: string };
  revoked: boolean;
  method?: string;
};

export type GitRemoteOperationSuccessAuditEvent = GitRemoteAuditEventBase & {
  type: 'fetch' | 'pull' | 'push';
  outcome: 'ok';
  updatedRefs?: unknown;
  integration?: 'up-to-date' | 'fast-forward' | 'merge' | 'rebase';
  head?: unknown;
};

export type GitRemoteOperationFailureAuditEvent = GitRemoteAuditEventBase & {
  type: 'fetch' | 'pull' | 'push';
  outcome: 'error';
  message: string;
  /**
   * Records that the pull's local integration step mutated HEAD before a
   * later policy, credential, or revoke event forced the operation to throw.
   */
  appliedLocally?: boolean;
};

export type GitRemoteAuditEvent =
  | GitRemotePolicyAuditEvent
  | GitRemoteOperationSuccessAuditEvent
  | GitRemoteOperationFailureAuditEvent;

export type GitRemoteSnapshot = GitRemotePolicy & { name: string };

export type GitRemote = {
  inspect: () => Promise<GitRemoteSnapshot>;
  fetch: (options?: { prune?: boolean; tags?: boolean }) => Promise<any>;
  pull: (options?: {
    branch?: unknown;
    strategy?: 'merge' | 'rebase' | 'ff-only';
    prune?: boolean;
    tags?: boolean;
  }) => Promise<any>;
  push: (options?: {
    refspecs?: string[];
    source?: string;
    destination?: string;
    force?: boolean;
    setUpstream?: boolean;
  }) => Promise<any>;
};

export type GitRemoteController = {
  inspect: () => Promise<GitRemoteSnapshot & { revoked: boolean }>;
  audit: () => Promise<any>;
  setAllowedDirections: (directions: GitDirection[]) => Promise<void>;
  setFetchRefspecs: (refspecs: string[]) => Promise<void>;
  setPushRefspecs: (refspecs: string[]) => Promise<void>;
  setAllowedBranches: (branches: string[]) => Promise<void>;
  setAllowForcePush: (flag: boolean) => Promise<void>;
  setAllowTags: (flag: boolean) => Promise<void>;
  setAllowDelete: (flag: boolean) => Promise<void>;
  revoke: () => Promise<void>;
};

export type GitRemoteKit = {
  remote: GitRemote;
  controller: GitRemoteController;
};
