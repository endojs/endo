import type { Passable } from '@endo/pass-style';
import type { ERef } from '@endo/eventual-send';
import type { FarRef } from '@endo/eventual-send';
import type { CapTPOptions } from '@endo/captp';
import type { Reader, Writer, Stream } from '@endo/stream';
import type { PassableBytesReader, StreamNode } from '@endo/exo-stream';
import type { EndoGit, GitRemote } from '@endo/exo-git';

// Branded string types for pet names and special names
declare const PetNameBrand: unique symbol;
declare const SpecialNameBrand: unique symbol;
declare const FormulaNumberBrand: unique symbol;
declare const NodeNumberBrand: unique symbol;
declare const FormulaIdentifierBrand: unique symbol;

/** A validated pet name (1–255 chars, no `/`, `\0`, or `@`, not `.` or `..`) */
export type PetName = string & { [PetNameBrand]: true };

/** A validated special name (@-prefixed, e.g., '@self', '@host', '@endo') */
export type SpecialName = string & { [SpecialNameBrand]: true };

/** A 64-character hex string identifying a formula within a node */
export type FormulaNumber = string & { [FormulaNumberBrand]: true };

/** A 64-character hex string (Ed25519 public key) identifying a node */
export type NodeNumber = string & { [NodeNumberBrand]: true };

/** A full formula identifier in the format {FormulaNumber}:{NodeNumber} */
export type FormulaIdentifier = string & { [FormulaIdentifierBrand]: true };

// Semantic aliases for the locator terminology (see
// designs/daemon-locator-terminology.md).  These are type-level
// aliases; they introduce no runtime change.
/** Ed25519 public key identifying a peer (alias for NodeNumber). */
export type PeerKey = NodeNumber;
/** Content address (SHA-256) or capability address (random 256-bit). */
export type FormulaAddress = FormulaNumber;
/** Full formula key: {formulaAddress}:{peerKey} (alias for FormulaIdentifier). */
export type FormulaKey = FormulaIdentifier;
/** A transport-prefixed address string (e.g., "ws-relay+captp0://host:8920"). */
export type ConnectionHint = string;

/** Peer key plus connection hints for reaching a peer. */
export type PeerLocator = {
  peerKey: PeerKey;
  hints: ConnectionHint[];
};

/** Formula key plus connection hints and type for locating a formula. */
export type FormulaLocator = {
  formulaKey: FormulaKey;
  formulaType: string;
  hints: ConnectionHint[];
};

/** Either a pet name or a special name */
export type Name = PetName | SpecialName;

/** A validated path of names (array of at least one name) */
export type NamePath = Name[];

/** Either a single name or a path of names */
export type NameOrPath = Name | NamePath;

/** An array of names or paths */
export type NamesOrPaths = NameOrPath[];

export type SomehowAsyncIterable<T> =
  | AsyncIterable<T>
  | Iterable<T>
  | { next: () => IteratorResult<T> };

export type Config = {
  statePath: string;
  ephemeralStatePath: string;
  cachePath: string;
  sockPath: string;
};

export type Sha256 = {
  update: (chunk: Uint8Array) => void;
  updateText: (chunk: string) => void;
  digestHex: () => string;
};

export type Ed25519Keypair = {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
  sign: (message: Uint8Array) => Uint8Array;
};

export type Connection = {
  reader: Reader<Uint8Array>;
  writer: Writer<Uint8Array>;
  closed: Promise<void>;
};

export type HttpRequest = {
  method: string;
  url: string;
  headers: Record<string, string | Array<string> | undefined>;
};

export type HttpResponse = {
  status: number;
  headers: Record<string, string>;
  content: AsyncIterable<string | Uint8Array> | string | Uint8Array | undefined;
};

export type HttpRespond = (request: HttpRequest) => Promise<HttpResponse>;
export type HttpConnect = (
  connection: Connection,
  request: HttpRequest,
) => void;

export type MignonicPowers = {
  connection: {
    reader: Reader<Uint8Array>;
    writer: Writer<Uint8Array>;
  };
};

export type IdRecord = {
  number: FormulaNumber;
  node: NodeNumber;
};

export type ParseIdRecord = IdRecord & {
  id: FormulaIdentifier;
};

export type EdgeName = string;

export type EnvRecord = Record<string, string>;

/**
 * Re-exports of the retention-path types defined in `graph.js`
 * (the segment / path shape) and `retention-path-accumulator.js`
 * (the delta shape). See `designs/daemon-retention-paths.md` §
 * Notation for the label conventions.
 */
export type RetentionPathSegment = import('./graph.js').RetentionPathSegment;
export type RetentionPath = import('./graph.js').RetentionPath;
export type RetentionPathDelta =
  import('./retention-path-accumulator.js').RetentionPathDelta;

export type EndoFormula = {
  type: 'endo';
  networks: FormulaIdentifier;
  pins: FormulaIdentifier;
  peers: FormulaIdentifier;
  host: FormulaIdentifier;
  leastAuthority: FormulaIdentifier;
};

export type LoopbackNetworkFormula = {
  type: 'loopback-network';
};

export type WorkerFormula = {
  type: 'worker';
  label?: string;
  trustedShims?: string[];
  kind?: 'locked' | 'node';
};

export type WorkerDeferredTaskParams = {
  workerId: FormulaIdentifier;
};

/**
 * Deferred tasks parameters for `host` and `guest` formulas.
 */
export type AgentDeferredTaskParams = {
  agentId: FormulaIdentifier;
  handleId: FormulaIdentifier;
};

export type HostFormula = {
  type: 'host';
  handle: FormulaIdentifier;
  hostHandle: FormulaIdentifier;
  mainWorker: FormulaIdentifier;
  nodeWorker: FormulaIdentifier;
  inspector: FormulaIdentifier;
  petStore: FormulaIdentifier;
  mailboxStore: FormulaIdentifier;
  mailHub: FormulaIdentifier;
  endo: FormulaIdentifier;
  networks: FormulaIdentifier;
  pins: FormulaIdentifier;
};

export type GuestFormula = {
  type: 'guest';
  handle: FormulaIdentifier;
  hostHandle: FormulaIdentifier;
  hostAgent: FormulaIdentifier;
  petStore: FormulaIdentifier;
  mailboxStore: FormulaIdentifier;
  mailHub: FormulaIdentifier;
  worker: FormulaIdentifier;
  networks: FormulaIdentifier;
};

type LeastAuthorityFormula = {
  type: 'least-authority';
};

export type MarshalFormula = {
  type: 'marshal';
  body: any;
  slots: Array<FormulaIdentifier>;
};

export type EvalFormula = {
  type: 'eval';
  worker: FormulaIdentifier;
  source: string;
  names: Array<string>; // lexical names
  values: Array<FormulaIdentifier>; // formula identifiers
  // TODO formula slots
};

export type MarshalDeferredTaskParams = {
  marshalFormulaNumber: FormulaNumber;
  marshalId: FormulaIdentifier;
};

export type EvalDeferredTaskParams = {
  endowmentIds: FormulaIdentifier[];
  evalId: FormulaIdentifier;
  workerId: FormulaIdentifier;
};

export type ReadableBlobFormula = {
  type: 'readable-blob';
  content: string;
};

export type ReadableBlobDeferredTaskParams = {
  readableBlobId: FormulaIdentifier;
};

export type ReadableTreeFormula = {
  type: 'readable-tree';
  content: string;
};

export type ReadableTreeDeferredTaskParams = {
  readableTreeId: FormulaIdentifier;
};

export type MountFormula = {
  type: 'mount';
  path: string;
  readOnly: boolean;
};

export type ScratchMountFormula = {
  type: 'scratch-mount';
  readOnly: boolean;
};

export type GitFormula = {
  type: 'git';
  mountId: FormulaIdentifier;
};

/**
 * Policy baked into a `shell` formula at `provideShell` time (formula-owned,
 * like `GitRemote`'s endpoint policy), so the capability reconstitutes across
 * daemon restart with the same bounds.  `env` and `searchPath` are host-private
 * construction inputs and are never revealed by `Shell.inspect()`.
 */
export type ShellPolicy = {
  allowedCommands: string[];
  timeoutMs: number;
  maxOutputBytes: number;
  env?: Record<string, string>;
  searchPath?: string;
};

export type ShellResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
  truncated: boolean;
};

export type ShellFormula = {
  type: 'shell';
  mountId: FormulaIdentifier;
  policy: ShellPolicy;
};

/**
 * Public `Shell` capability surface, minted by `EndoHost.provideShell` and
 * `DaemonCore.formulateShell`.  Argv-only (`exec(command, args[])`); there is
 * deliberately no shell-string mode.  `inspect()` reveals the policy bounds but
 * never the host working directory, env passlist, or search path.
 */
export interface EndoShell {
  inspect(): Promise<{
    allowedCommands: string[];
    timeoutMs: number;
    maxOutputBytes: number;
  }>;
  exec(
    command: string,
    args: string[],
    options?: { timeoutMs?: number },
  ): Promise<ShellResult>;
}

export type ShellDeferredTaskParams = {
  shellId: FormulaIdentifier;
};

export type GitCredentialFormula = {
  type: 'git-credential';
  kind: 'bearer' | 'basic';
  audience: string;
};

export type GitRemoteFormula = {
  type: 'git-remote';
  gitId: FormulaIdentifier;
  credentialId?: FormulaIdentifier;
  name: string;
  policy: {
    url: string;
    allowedDirections: Array<'fetch' | 'push'>;
    fetchRefspecs: string[];
    pushRefspecs: string[];
    allowedBranches?: string[];
    allowForcePush?: boolean;
    allowTags?: boolean;
    allowDelete?: boolean;
    allowLocalFileTransport?: boolean;
  };
  revoked?: boolean;
};

export type MountDeferredTaskParams = {
  mountId: FormulaIdentifier;
};

export type ScratchMountDeferredTaskParams = {
  scratchMountId: FormulaIdentifier;
};

export type GitDeferredTaskParams = {
  gitId: FormulaIdentifier;
};

export type GitCredentialDeferredTaskParams = {
  gitCredentialId: FormulaIdentifier;
};

export type GitRemoteDeferredTaskParams = {
  gitRemoteId: FormulaIdentifier;
};

export type LookupFormula = {
  type: 'lookup';

  /**
   * The formula identifier of the naming hub to call lookup on.
   * A "naming hub" is an object with a variadic `lookup()` method.
   */
  hub: FormulaIdentifier;

  /**
   * The pet name path.
   */
  path: NamePath;
};

export type MakeUnconfinedFormula = {
  type: 'make-unconfined';
  worker: FormulaIdentifier;
  powers: FormulaIdentifier;
  specifier: string;
  env?: Record<string, string>;
  cancelWithWorker?: FormulaIdentifier;
  // TODO formula slots
};

export type MakeArchiveFormula = {
  type: 'make-archive';
  worker: FormulaIdentifier;
  powers: FormulaIdentifier;
  archive: FormulaIdentifier;
  env?: Record<string, string>;
  cancelWithWorker?: FormulaIdentifier;
  // TODO formula slots
};

export type MakeFromTreeFormula = {
  type: 'make-from-tree';
  worker: FormulaIdentifier;
  powers: FormulaIdentifier;
  /** ReadableTree or Mount formula identifier providing module sources. */
  tree: FormulaIdentifier;
  env?: Record<string, string>;
  cancelWithWorker?: FormulaIdentifier;
  // TODO formula slots
};

export type MakeCapletDeferredTaskParams = {
  capletId: FormulaIdentifier;
  powersId: FormulaIdentifier;
  workerId: FormulaIdentifier;
};

export type PeerFormula = {
  type: 'peer';
  networks: FormulaIdentifier;
  node: NodeNumber;
  addresses: Array<string>;
};

export type HandleFormula = {
  type: 'handle';
  agent: FormulaIdentifier;
};

type KnownPeersStoreFormula = {
  type: 'known-peers-store';
};

export type PetStoreFormula = {
  type: 'pet-store';
};

export type MailboxStoreFormula = {
  type: 'mailbox-store';
};

export type MailHubFormula = {
  type: 'mail-hub';
  store: FormulaIdentifier;
};

export type MessageFormula = {
  type: 'message';
  messageType: 'request' | 'package' | 'definition' | 'form' | 'value';
  messageId: FormulaNumber;
  replyTo?: FormulaNumber;
  from: FormulaIdentifier;
  to: FormulaIdentifier;
  date: string;
  done?: boolean;
  description?: string;
  promiseId?: FormulaIdentifier;
  resolverId?: FormulaIdentifier;
  strings?: string[];
  names?: string[];
  ids?: FormulaIdentifier[];
  source?: string;
  slots?: Record<string, { label: string; pattern?: unknown }>;
  fields?: FormField[];
  valueId?: FormulaIdentifier;
};

// Pending is represented by the absence of a status entry in the promise store.
export type PromiseFormula = {
  type: 'promise';
  store: FormulaIdentifier;
};

export type ResolverFormula = {
  type: 'resolver';
  store: FormulaIdentifier;
};

export type PetInspectorFormula = {
  type: 'pet-inspector';
  petStore: FormulaIdentifier;
};

export type DirectoryFormula = {
  type: 'directory';
  petStore: FormulaIdentifier;
};

export type ChannelFormula = {
  type: 'channel';
  handle: FormulaIdentifier;
  creatorAgent: FormulaIdentifier;
  messageStore: FormulaIdentifier;
  memberStore: FormulaIdentifier;
  proposedName: string;
};

export type ChannelDeferredTaskParams = {
  channelId: FormulaIdentifier;
};

export type ChannelMessage = {
  type: 'package';
  messageId: FormulaNumber;
  number: bigint;
  date: string;
  memberId: string;
  strings: string[];
  names: Name[];
  ids: FormulaIdentifier[];
  replyTo?: string;
  replyType?: string;
};

export type InvitationFormula = {
  type: 'invitation';
  hostAgent: FormulaIdentifier;
  hostHandle: FormulaIdentifier;
  guestName: NameOrPath;
};

export type InvitationDeferredTaskParams = {
  invitationId: FormulaIdentifier;
};

export type TimerFormula = {
  type: 'timer';
  intervalMs: number;
  label: string;
};

export type Formula =
  | ChannelFormula
  | EndoFormula
  | LoopbackNetworkFormula
  | WorkerFormula
  | HostFormula
  | GuestFormula
  | LeastAuthorityFormula
  | MarshalFormula
  | EvalFormula
  | ReadableBlobFormula
  | ReadableTreeFormula
  | MountFormula
  | ScratchMountFormula
  | GitFormula
  | ShellFormula
  | GitCredentialFormula
  | GitRemoteFormula
  | LookupFormula
  | MakeUnconfinedFormula
  | MakeArchiveFormula
  | MakeFromTreeFormula
  | HandleFormula
  | PetInspectorFormula
  | KnownPeersStoreFormula
  | PetStoreFormula
  | MailboxStoreFormula
  | MailHubFormula
  | MessageFormula
  | PromiseFormula
  | ResolverFormula
  | DirectoryFormula
  | PeerFormula
  | InvitationFormula
  | TimerFormula;

export type Builtins = {
  NONE: FormulaIdentifier;
  MAIN: FormulaIdentifier;
  ENDO: FormulaIdentifier;
};

export type Special = (builtins: Builtins) => Formula;

export type Specials = {
  [specialName: string]: Special;
};

export interface Responder {
  resolveWithId(id: string | Promise<string>): void;
}

export type MessageBase = {
  messageId: FormulaNumber;
  replyTo?: FormulaNumber;
};

export type Request = MessageBase & {
  type: 'request';
  description: string;
  promiseId: FormulaIdentifier;
  resolverId: FormulaIdentifier;
  settled: Promise<'fulfilled' | 'rejected'>;
};

export type Package = MessageBase & {
  type: 'package';
  strings: Array<string>; // text that appears before, between, and after named formulas.
  names: Array<Name>; // edge names
  ids: Array<FormulaIdentifier>; // formula identifiers
};

export type DefineRequest = MessageBase & {
  type: 'definition';
  replyTo?: FormulaNumber;
  source: string;
  slots: Record<string, { label: string; pattern?: unknown }>;
};

export type FormField = {
  name: string;
  label: string;
  example?: string;
  default?: unknown;
  pattern?: unknown;
  secret?: boolean;
};

export type Form = MessageBase & {
  type: 'form';
  replyTo?: FormulaNumber;
  description: string;
  fields: FormField[];
};

export type ValueMessage = MessageBase & {
  type: 'value';
  replyTo: FormulaNumber;
  valueId: FormulaIdentifier;
};

export type Message = Request | Package | DefineRequest | Form | ValueMessage;

export type EnvelopedMessage = Message & {
  to: FormulaIdentifier;
  from: FormulaIdentifier;
};

export interface Dismisser {
  dismiss(): void;
}

export type StampedMessage = EnvelopedMessage & {
  number: bigint;
  date: string;
  done: boolean;
  dismissed: Promise<void>;
  dismisser: ERef<Dismisser>;
};

export type MessageRevision = {
  envelope: Message & { to: FormulaIdentifier; from: FormulaIdentifier };
  done: boolean;
  date: string;
  timestamp: number;
};

export interface Invitation {
  accept(
    guestHandleLocator: string,
    hostNameFromGuest?: string,
  ): Promise<{ syncedStoreNumber: FormulaNumber }>;
  locate(): Promise<string>;
}

export interface Topic<
  TRead,
  TWrite = undefined,
  TReadReturn = undefined,
  TWriteReturn = undefined,
> {
  publisher: Stream<TWrite, TRead, TWriteReturn, TReadReturn>;
  subscribe(): Stream<TRead, TWrite, TReadReturn, TWriteReturn>;
}

/**
 * The cancellation context of a live value associated with a formula.
 */
export interface Context {
  /**
   * The identifier for the associated formula.
   */
  id: FormulaIdentifier;
  /**
   * Cancel the value, preparing it for garbage collection. Cancellation
   * propagates to all values that depend on this value.
   *
   * @param reason - The reason for the cancellation.
   * @param logPrefix - The prefix to use within the log.
   * @returns A promise that is resolved when the value is cancelled and
   * can be garbage collected.
   */
  cancel: (reason?: Error, logPrefix?: string) => Promise<void>;

  /**
   * A promise that is rejected when the context is cancelled.
   * Once rejected, the cancelled value may initiate any teardown procedures.
   */
  cancelled: Promise<never>;

  /**
   * A promise that is resolved when the context is disposed. This occurs
   * after the `cancelled` promise is rejected, and after all disposal hooks
   * have been run.
   * Once resolved, the value may be garbage collected at any time.
   */
  disposed: Promise<void>;

  /**
   * @param id - The formula identifier of the value whose
   * cancellation should cause this value to be cancelled.
   */
  thisDiesIfThatDies: (id: string) => void;

  /**
   * @param id - The formula identifier of the value that should
   * be cancelled if this value is cancelled.
   */
  thatDiesIfThisDies: (id: string) => void;

  /**
   * @param hook - A hook to run when the value is cancelled.
   */
  onCancel: (hook: () => void | Promise<void>) => void;
}

export interface FarContext {
  id: () => FormulaIdentifier;
  cancel: (reason: Error) => Promise<void>;
  whenCancelled: () => Promise<never>;
  whenDisposed: () => Promise<void>;
  addDisposalHook: Context['onCancel'];
}

export interface Controller<Value = unknown> {
  value: Promise<Value>;
  context: Context;
}

export type FormulaMaker<F extends Formula> = (
  formula: F,
  context: Context,
  id: FormulaIdentifier,
  number: FormulaNumber,
) => unknown;

export type FormulaMakerTable = {
  [T in Formula['type']]: FormulaMaker<{ type: T } & Formula>;
};

export interface Envelope {}

export interface Handle {
  receive(envelope: Envelope, allegedFromId: string): void;
  open(envelope: Envelope): EnvelopedMessage;
}

export type MakeSha256 = () => Sha256;

export type PetStoreNameChange =
  | { add: Name; value: IdRecord; type?: string }
  | { remove: Name };

export type PetStoreIdNameChange =
  | { add: IdRecord; names: Name[] }
  | { remove: IdRecord; names?: Name[] };

export type NameChangesTopic = Topic<PetStoreNameChange>;

export type IdChangesTopic = Topic<PetStoreIdNameChange>;

export interface PetStore {
  has(petName: Name): boolean;
  identifyLocal(petName: Name): string | undefined;
  list(): Array<Name>;
  /**
   * Subscribe to all name changes. First publishes all existing names in alphabetical order.
   * Then publishes diffs as names are added and removed.
   */
  followNameChanges(): AsyncGenerator<PetStoreNameChange, undefined, undefined>;
  /**
   * Subscribe to name changes for the specified id. First publishes the existing names for the id.
   * Then publishes diffs as names are added and removed, or if the id is itself removed.
   * @throws If attempting to follow an id with no names.
   */
  followIdNameChanges(
    id: string,
  ): AsyncGenerator<PetStoreIdNameChange, undefined, undefined>;
  storeIdentifier(petName: PetName, id: string): Promise<void>;
  remove(petName: PetName): Promise<void>;
  rename(fromPetName: PetName, toPetName: PetName): Promise<void>;
  /**
   * @param id The formula identifier to look up.
   * @returns The formula identifier for the given pet name, or `undefined` if the pet name is not found.
   */
  reverseIdentify(id: string): Array<Name>;
}

// --- Synced Pet Store (CRDT) types ---

export type KnownPeersStore = Omit<
  PetStore,
  'has' | 'identifyLocal' | 'storeIdentifier'
> & {
  has(nodeNumber: NodeNumber): boolean;
  identifyLocal(nodeNumber: NodeNumber): string | undefined;
  storeIdentifier(nodeNumber: NodeNumber, id: string): Promise<void>;
};

/**
 * `add` and `remove` are locators.
 */
export type LocatorNameChange =
  | { add: string; names: Name[] }
  | { remove: string; names?: Name[] };

export interface NameHub {
  has(...petNamePath: string[]): Promise<boolean>;
  identify(...petNamePath: string[]): Promise<string | undefined>;
  locate(...petNamePath: string[]): Promise<string | undefined>;
  reverseLocate(locator: string): Promise<Name[]>;
  followLocatorNameChanges(
    locator: string,
  ): AsyncGenerator<LocatorNameChange, undefined, undefined>;
  list(...petNamePath: string[]): Promise<Array<Name>>;
  listIdentifiers(...petNamePath: string[]): Promise<Array<string>>;
  listLocators(...petNamePath: string[]): Promise<Record<string, string>>;
  followNameChanges(
    ...petNamePath: string[]
  ): AsyncGenerator<PetStoreNameChange, undefined, undefined>;
  lookup(petNamePath: string | string[]): Promise<unknown>;
  maybeLookup(petNamePath: string | string[]): unknown;
  reverseLookup(value: unknown): Array<Name>;
  storeIdentifier(petNamePath: string | string[], id: string): Promise<void>;
  storeLocator(petNamePath: string | string[], locator: string): Promise<void>;
  remove(...petNamePath: string[]): Promise<void>;
  move(fromPetName: string[], toPetName: string[]): Promise<void>;
  copy(fromPetName: string[], toPetName: string[]): Promise<void>;
}

export interface EndoDirectory extends NameHub {
  makeDirectory(petNamePath: string | string[]): Promise<EndoDirectory>;
  readText(petNamePath: string | string[]): Promise<string>;
  maybeReadText(petNamePath: string | string[]): Promise<string | undefined>;
  writeText(petNamePath: string | string[], content: string): Promise<void>;
}

export type GcHooks = {
  onPetStoreWrite: (storeId: FormulaIdentifier, id: FormulaIdentifier) => void;
  onPetStoreRemove: (storeId: FormulaIdentifier, id: FormulaIdentifier) => void;
  isLocalId: (id: string) => boolean;
  withFormulaGraphLock: (asyncFn?: () => Promise<any>) => Promise<any>;
};

export interface StoreController {
  has(petName: Name): boolean;
  identifyLocal(petName: Name): string | undefined;
  list(): Array<Name>;
  reverseIdentify(id: string): Array<Name>;

  storeIdentifier(petName: PetName, id: string): Promise<void>;
  storeLocator(petName: PetName, locator: string): Promise<void>;
  remove(petName: PetName): Promise<void>;
  rename(fromPetName: PetName, toPetName: PetName): Promise<void>;

  followNameChanges(): AsyncGenerator<PetStoreNameChange, undefined, undefined>;
  followIdNameChanges(
    id: string,
  ): AsyncGenerator<PetStoreIdNameChange, undefined, undefined>;

  seedGcEdges(): Promise<void>;
}

export type MakeDirectoryNode = (
  controller: StoreController,
  agentNodeNumber: NodeNumber,
  isLocalKey: (node: string) => boolean,
  getNetworkAddresses: () => Promise<string[]>,
) => EndoDirectory;

export interface Mail {
  handle: () => Handle;
  // Partial inheritance from StoreController:
  petStore: StoreController;
  // Mail operations:
  listMessages(): Promise<Array<StampedMessage>>;
  followMessages(): AsyncGenerator<StampedMessage, undefined, undefined>;
  resolve(messageNumber: bigint, resolutionName: string): Promise<void>;
  reject(messageNumber: bigint, message?: string): Promise<void>;
  adopt(
    messageNumber: bigint,
    edgeName: string,
    petName: string[],
  ): Promise<void>;
  dismiss(messageNumber: bigint): Promise<void>;
  dismissAll(): Promise<void>;
  reply(
    messageNumber: bigint,
    strings: Array<string>,
    edgeNames: Array<string>,
    petNamesOrPaths: Array<string | string[]>,
  ): Promise<void>;
  request(
    recipientNameOrPath: string | string[],
    what: string,
    responseNameOrPath?: string | string[],
  ): Promise<unknown>;
  send(
    recipientNameOrPath: string | string[],
    strings: Array<string>,
    edgeNames: Array<string>,
    petNamesOrPaths: Array<string | string[]>,
    replyToMessageNumber?: bigint,
  ): Promise<void>;
  deliver(message: EnvelopedMessage): Promise<void>;
  define(
    source: string,
    slots: Record<string, { label: string; pattern?: unknown }>,
  ): Promise<void>;
  form(
    recipientNameOrPath: string | string[],
    description: string,
    fields: FormField[],
  ): Promise<void>;
  getDefineRequest(messageNumber: bigint): {
    source: string;
    slots: Record<string, { label: string; pattern?: unknown }>;
    guestHandleId: string;
    messageId: FormulaNumber;
  };
  getForm(messageNumber: bigint): {
    description: string;
    fields: FormField[];
    messageId: FormulaNumber;
    guestHandleId: string;
  };
  submit(messageNumber: bigint, values: Record<string, unknown>): Promise<void>;
  sendValue(
    messageNumber: bigint,
    petNameOrPath: string | string[],
  ): Promise<void>;
  /**
   * Deliver a value message to the local inbox only, bypassing the remote
   * recipient.  Used by endow() so the eval result appears in the host's
   * conversation thread without leaking to the proposer.
   */
  deliverValueById(
    messageNumber: bigint,
    valueId: FormulaIdentifier,
  ): Promise<void>;
  /**
   * Replace the interior of a message the caller previously sent.
   *
   * Only the original sender may edit.  Edits keep the same message
   * number, reply-to linkage, and dismissal state but replace the
   * payload.  The prior revision is retained in history
   * (see `messageHistory`).
   *
   * `options.done` (default `true`) flags whether the revision represents
   * a partial submission (`false`) or a settled state (`true`).  Edits
   * after a settled revision are still accepted and recorded.
   */
  editMessage(
    messageNumber: bigint,
    strings: Array<string>,
    edgeNames: Array<string>,
    petNamesOrPaths: Array<string | string[]>,
    options?: { done?: boolean },
  ): Promise<void>;
  /**
   * Return the ordered revision history of a message in the caller's
   * inbox or outbox.  Oldest entry first.  The current message content is
   * equivalent to the last entry's envelope.
   */
  messageHistory(messageNumber: bigint): Promise<Array<MessageRevision>>;
}

export type MakeMailbox = (args: {
  selfId: FormulaIdentifier;
  agentNodeNumber: NodeNumber;
  petStore: StoreController;
  mailboxStore: StoreController;
  directory: EndoDirectory;
  context: Context;
}) => Promise<Mail>;

export type RequestFn = (
  what: string,
  responseName: string,
  guestId: string,
  guestPetStore: StoreController,
) => Promise<unknown>;

export interface EndoReadable {
  streamBase64(
    synPromise: ERef<StreamNode<Passable, Passable>>,
  ): Promise<StreamNode<string, undefined>>;
  text(): Promise<string>;
  json(): Promise<unknown>;
  getInfo(): Promise<BlobInfo>;
  fetch(offset: bigint, length: bigint): Promise<PassableBytesReader>;
  help(method?: string): string;
}

export interface EndoReadableTree {
  sha256(): string;
  getInfo(): Promise<BlobInfo>;
  has(...pathSegments: string[]): Promise<boolean>;
  list(...pathSegments: string[]): Promise<string[]>;
  lookup(path: string | string[]): Promise<EndoReadableTree | EndoReadable>;
  help(method?: string): string;
}

/**
 * File metadata, aligned with the extended `Stat` shape from
 * `@endo/platform/fs/extended` (size: bigint, mtime/atime: bigint nanoseconds
 * since epoch). `kind` is additive — the mount stats a *path*, which may be a
 * file or directory, where the extended engine relies on the cap type. See
 * designs/fs-interface-consolidation.md.
 */
export type EndoMountStat = {
  kind: 'file' | 'directory' | 'symlink';
  size: bigint;
  mtime: bigint;
  atime: bigint;
};

export interface EndoMountEntry {
  segments(): string[];
  displayPath(): string;
  child(name: string): EndoMountEntry;
  help(method?: string): string;
}

/**
 * The `{ algorithm, hash, size }` content-address triple returned by a rich
 * blob's `getInfo()`. `hash` is base64; `algorithm` is `'sha256'`.
 */
export type BlobInfo = {
  algorithm: string;
  hash: string;
  size: bigint;
};

/**
 * Structural `ReadableBlob` view exposed by `EndoMountFile.readOnly()`.
 * Mirrors the rich `ReadableBlob` (range I/O) from `@endo/platform/fs`: a
 * write-disabled face over a live file.
 */
export interface ReadableBlobView {
  streamBase64(
    synPromise: ERef<StreamNode<Passable, Passable>>,
  ): Promise<StreamNode<string, undefined>>;
  text(): Promise<string>;
  json(): Promise<unknown>;
  getInfo(): Promise<BlobInfo>;
  fetch(offset: bigint, length: bigint): Promise<PassableBytesReader>;
  help(method?: string): string;
}

/**
 * Structural `ReadableTree` view exposed by `EndoMount.readOnly()`.
 * Mirrors `ReadableTree` from `@endo/platform/fs`; `lookup` recursively
 * returns either another `ReadableTreeView` or a `ReadableBlobView`.
 */
export interface ReadableTreeView {
  has(...pathSegments: string[]): Promise<boolean>;
  list(...pathSegments: string[]): Promise<string[]>;
  lookup(path: string | string[]): Promise<ReadableTreeView | ReadableBlobView>;
  help(method?: string): string;
}

export interface EndoGitTree {
  archiveTar(): PassableBytesReader;
  archiveLossless(): Promise<boolean>;
  has(...pathSegments: string[]): Promise<boolean>;
  list(...pathSegments: string[]): Promise<string[]>;
  lookup(path: string | string[]): Promise<EndoGitTree | EndoReadable>;
}

/**
 * `EndoMountFile` is a daemon-local specialization of the platform
 * `File` contract.  Mount-specific surface (`stat`, `snapshot`,
 * `writeText` / `append` / `writeBytes` that throw on read-only) is
 * additive; `readOnly()` narrows to a structural `ReadableBlob` view.
 */
export interface EndoMountFile {
  text(): Promise<string>;
  streamBase64(
    synPromise: ERef<StreamNode<Passable, Passable>>,
  ): Promise<StreamNode<string, undefined>>;
  json(): Promise<unknown>;
  getInfo(): Promise<BlobInfo>;
  fetch(offset: bigint, length: bigint): Promise<PassableBytesReader>;
  writeText(content: string): Promise<void>;
  append(content: string): Promise<void>;
  writeBytes(readableRef: ERef<PassableBytesReader>): Promise<void>;
  stat(): Promise<EndoMountStat>;
  snapshot(): Promise<FarRef<EndoReadable>>;
  readOnly(): ReadableBlobView;
  help(method?: string): string;
}

/**
 * `EndoMount` is a daemon-local specialization of the platform
 * `Directory` contract.  Overlapping methods (`has`, `list`, `lookup`,
 * `write`, `remove`, `move`, `copy`, `makeDirectory`, `snapshot`) match
 * the platform shapes; mount-specific extensions (`entry`, `stat`,
 * `displayPath`, `readText`, `maybeReadText`, `writeText`, `makeFile`)
 * are additive; `readOnly()` narrows to a structural `ReadableTree`
 * view.
 */
export interface EndoMount {
  has(...pathSegments: string[]): Promise<boolean>;
  has(entry: EndoMountEntry): Promise<boolean>;
  list(...pathSegments: string[]): Promise<string[]>;
  lookup(
    path: string | string[] | EndoMountEntry,
  ): Promise<EndoMount | EndoMountFile>;
  /**
   * The `ReadableNameHub` lookup-or-undefined primitive: resolve `path`
   * and return its handle, or `undefined` when the path is absent or
   * escapes confinement.
   */
  maybeLookup(
    path: string | string[] | EndoMountEntry,
  ): Promise<EndoMount | EndoMountFile | undefined>;
  /**
   * Part of the name-hub contract, but a live change feed requires a
   * filesystem watcher behind the mount (filesystem-watchers.md), which is
   * not yet implemented; throws ENOSYS until then.
   */
  followNameChanges(): never;
  /**
   * Confined sub-root: returns a sub-mount whose own confinement root is
   * the target directory, so `..` cannot escape it. The transient,
   * in-session counterpart to `provideSubMount`.
   */
  subView(path: string | string[] | EndoMountEntry): Promise<EndoMount>;
  write(
    path: string | string[] | EndoMountEntry,
    value: unknown,
  ): Promise<void>;
  copy(
    from: string | string[] | EndoMountEntry,
    to: string | string[] | EndoMountEntry,
  ): Promise<void>;
  entry(path: string | string[]): EndoMountEntry;
  stat(
    path: string | string[] | EndoMountEntry,
  ): Promise<EndoMountStat | undefined>;
  readText(path: string | string[] | EndoMountEntry): Promise<string>;
  maybeReadText(
    path: string | string[] | EndoMountEntry,
  ): Promise<string | undefined>;
  writeText(
    path: string | string[] | EndoMountEntry,
    content: string,
  ): Promise<void>;
  makeDirectory(path: string | string[] | EndoMountEntry): Promise<EndoMount>;
  makeFile(
    path: string | string[] | EndoMountEntry,
    content?: string,
  ): Promise<void>;
  remove(path: string | string[] | EndoMountEntry): Promise<void>;
  move(
    from: string | string[] | EndoMountEntry,
    to: string | string[] | EndoMountEntry,
  ): Promise<void>;
  readOnly(): ReadableTreeView;
  snapshot(): Promise<unknown>;
  help(method?: string): string;
}

export interface EndoWorker {}

export type MakeHostOrGuestOptions = {
  agentName?: string | string[];
  introducedNames?: Record<string, string>;
};

export type MakeCapletOptions = {
  powersName?: string | string[];
  resultName?: string | string[];
  env?: Record<string, string>;
  workerTrustedShims?: string[];
};

export interface EndoPeer {
  provide: (id: string) => Promise<unknown>;
}

export interface EndoGateway {
  provide: (id: string) => Promise<unknown>;
  followRetentionSet: (
    peerNodeNumber: string,
  ) => Promise<
    import('@endo/exo-stream').PassableReader<
      import('./retention-accumulator.js').RetentionDelta,
      undefined
    >
  >;
}

export interface EndoGreeter {
  hello: (
    remoteNodeKey: string,
    remoteGateway: Promise<EndoGateway>,
    cancel: (error: Error) => void,
    cancelled: Promise<never>,
  ) => Promise<EndoGateway>;
}

export interface PeerInfo {
  node: NodeNumber;
  addresses: string[];
  connectionState?: string;
}

export interface EndoNetwork {
  supports: (network: string) => boolean;
  addresses: () => Array<string>;
  connect: (address: string, farContext: FarContext) => Promise<EndoGateway>;
}

export interface EndoAgent extends EndoDirectory {
  handle: () => {};
  listMessages: Mail['listMessages'];
  followMessages: Mail['followMessages'];
  resolve: Mail['resolve'];
  reject: Mail['reject'];
  adopt: Mail['adopt'];
  dismiss: Mail['dismiss'];
  dismissAll: Mail['dismissAll'];
  reply: Mail['reply'];
  request: Mail['request'];
  send: Mail['send'];
  sendValue: Mail['sendValue'];
  deliver: Mail['deliver'];
  editMessage: Mail['editMessage'];
  messageHistory: Mail['messageHistory'];
  /**
   * @param id The formula identifier to look up.
   * @returns The pet names for the given formula identifier.
   */
  reverseIdentify(id: string): Array<Name>;
  /**
   * @param id The formula identifier to look up.
   * @returns The value for the given formula identifier.
   */
  lookupById(id: string): Promise<unknown>;
  /**
   * @param locator The `endo://` locator to look up.
   * @returns The value for the given locator.
   */
  lookupByLocator(locator: string): Promise<unknown>;
}

export interface EndoGuest extends EndoAgent {
  /** Evaluate code directly in a worker, constrained by reachable capabilities. */
  evaluate(
    workerPetName: string | string[] | undefined,
    source: string,
    codeNames: Array<string>,
    petNamesOrPaths: Array<string | string[]>,
    resultNameOrPath?: string | string[],
  ): Promise<unknown>;
  define(
    source: string,
    slots: Record<string, { label: string; pattern?: unknown }>,
  ): Promise<void>;
  form(
    recipientNameOrPath: string | string[],
    description: string,
    fields: FormField[],
  ): Promise<void>;
  storeBlob(
    readerRef: ERef<PassableBytesReader>,
    petName?: string | string[],
  ): Promise<unknown>;
  storeValue<T extends Passable>(
    value: T,
    petName: string | string[],
  ): Promise<void>;
  submit(messageNumber: bigint, values: Record<string, unknown>): Promise<void>;
  sendValue: Mail['sendValue'];
}

export type FarEndoGuest = FarRef<EndoGuest>;

export interface EndoHost extends EndoAgent {
  form(
    recipientNameOrPath: string | string[],
    description: string,
    fields: FormField[],
  ): Promise<void>;
  storeBlob(
    readerRef: ERef<PassableBytesReader>,
    petName: string | string[],
  ): Promise<FarRef<EndoReadable>>;
  storeValue<T extends Passable>(
    value: T,
    petName: string | string[],
  ): Promise<void>;
  storeTree(remoteTree: unknown, petName: string | string[]): Promise<unknown>;
  provideMount(
    path: string,
    petName: string | string[],
    opts?: { readOnly?: boolean },
  ): Promise<EndoMount>;
  provideScratchMount(petName: string | string[]): Promise<EndoMount>;
  provideGit(mountCap: EndoMount, petName: string | string[]): Promise<EndoGit>;
  /**
   * Derive an allowlisted, argv-only command-execution `Shell` from a
   * **writable** mount.  The child working directory is resolved host-side
   * (never guest-visible) and the `policy` — allowlist, sanitized-env passlist,
   * timeout, and output cap — is baked into the formula so it survives restart.
   * Rejects a read-only mount: a child process holds OS-level write authority a
   * read-only mount cannot bound.  Host-only; not exposed to guests.
   */
  provideShell(
    mountCap: EndoMount,
    petName: string | string[],
    policy: ShellPolicy,
  ): Promise<EndoShell>;
  /**
   * Mint a `GitRemote` capability bound to `gitCap`, persist its
   * formula, and bind it to `petName`.  The remote enforces the
   * supplied policy (allowed directions, refspecs, force-push, etc.)
   * against every operation.  Host-only; not exposed to guests.  The
   * guest holds the returned exo (which exposes `fetch`/`pull`/`push`
   * and `inspect()`); the controller surface
   * (`getGitRemoteController`) lives on the host side and stays
   * within `EndoHost`.
   */
  provideGitRemote(
    gitCap: unknown,
    petName: string | string[],
    opts: {
      name: string;
      url: string;
      allowedDirections?: Array<'fetch' | 'push'>;
      fetchRefspecs?: string[];
      pushRefspecs?: string[];
      allowedBranches?: string[];
      allowForcePush?: boolean;
      allowTags?: boolean;
      allowDelete?: boolean;
      allowLocalFileTransport?: boolean;
      credential?: unknown;
    },
  ): Promise<GitRemote>;
  /**
   * Host-only constructive clone. Composes a repo-less remote endpoint
   * with an empty destination mount, returning a fresh Git cap and an
   * origin-pre-bound GitRemote. The returned origin remote is bound
   * for fetch and push over `refs/heads/*` only. This leaves the later
   * guest-held GitCloner facet as an additive delegate.
   */
  provideGitClone(opts: {
    destMount: EndoMount;
    endpoint: {
      url: string;
      credential?: unknown;
      allowLocalFileTransport?: boolean;
    };
  }): Promise<{ git: EndoGit; remote: GitRemote }>;
  /**
   * Mint a bearer-token `GitCredential` capability scoped to
   * `audience` (a URL origin) and bind it to `petName`.  Material
   * lives in a daemon-process-local map; daemon restart routes the
   * cap through `makeUnavailableGitCredential` (durable identity,
   * ephemeral material).  Host-only; not exposed to guests.  Guests
   * receive only the `audience()` view of the resulting capability.
   */
  provideBearerCredential(
    petName: string | string[],
    options: { audience: string; token: string },
  ): Promise<unknown>;
  /**
   * Mint a basic-auth `GitCredential` capability scoped to `audience`
   * and bind it to `petName`.  Same material-residency contract as
   * `provideBearerCredential`: host-only, daemon-process-local
   * material, audience-gated transport use.
   */
  provideBasicCredential(
    petName: string | string[],
    options: { audience: string; username: string; password: string },
  ): Promise<unknown>;
  /**
   * Privileged accessor: return the host-side controller paired with
   * a daemon-minted `GitCredential` exo.  The controller exposes
   * `inspect`, `rotate`, `revoke`, and `audit`; the guest-held
   * credential exposes only `audience()`.  Host-only; not exposed to
   * guests.  Returns `undefined` for spoof / fake credentials that
   * did not pass through `provideBearerCredential` or
   * `provideBasicCredential`.
   */
  getGitCredentialController(credential: unknown): Promise<unknown>;
  /**
   * Privileged accessor: return the host-side controller paired with
   * a daemon-minted `GitRemote` exo.  The controller exposes policy
   * setters (`setAllowedDirections`, `setFetchRefspecs`,
   * `setPushRefspecs`, ...), `revoke`, and `audit`.  Host-only; not
   * exposed to guests.  Returns `undefined` for spoof / fake remotes
   * that did not pass through `provideGitRemote`.
   */
  getGitRemoteController(remote: unknown): Promise<unknown>;
  /**
   * Privileged bridge from a daemon-minted top-level Mount cap to its
   * host filesystem path. EndoHost is a fully privileged authority;
   * callers that should not learn host paths must receive an
   * attenuated guest or narrower powers object instead.
   */
  provideHostPath(cap: unknown): Promise<string>;
  provideGuest(
    petName?: string | string[],
    opts?: MakeHostOrGuestOptions,
  ): Promise<EndoGuest>;
  provideHost(
    petName?: string | string[],
    opts?: MakeHostOrGuestOptions,
  ): Promise<EndoHost>;
  makeDirectory(petNamePath: string | string[]): Promise<EndoDirectory>;
  provideWorker(petNamePath: string | string[]): Promise<EndoWorker>;
  evaluate(
    workerPetName: string | string[] | undefined,
    source: string,
    codeNames: Array<string>,
    petNamesOrPaths: Array<string | string[]>,
    resultName?: string | string[],
  ): Promise<unknown>;
  makeUnconfined(
    workerName: string | string[] | undefined,
    specifier: string,
    options?: MakeCapletOptions,
  ): Promise<unknown>;
  makeArchive(
    workerPetName: string | string[] | undefined,
    archiveName: string | string[],
    options?: MakeCapletOptions,
  ): Promise<unknown>;
  makeFromTree(
    workerPetName: string | string[] | undefined,
    treeName: string | string[],
    options?: MakeCapletOptions,
  ): Promise<unknown>;
  /**
   * Materialise a ReadableTree or Mount into a new scratch mount
   * under `scratchPetName` and return that scratch mount.  The
   * scratch lives as long as its pet name; cancelling the pet name
   * removes it.
   */
  stageTree(
    treeName: string | string[],
    scratchPetName: string | string[],
  ): Promise<unknown>;
  /**
   * Stage a readable tree (ReadableTree or Mount) into an internal
   * scratch directory under the Endo state tree and invoke the Node
   * unconfined loader against `options.entry` (default `index.js`).
   * Supports native Node modules (unlike {@link makeFromTree}).
   */
  makeUnconfinedFromTree(
    workerPetName: string | string[] | undefined,
    treeName: string | string[],
    options?: MakeCapletOptions & { entry?: string },
  ): Promise<unknown>;
  cancel(petNameOrPath: string | string[], reason?: Error): Promise<void>;
  greeter(): Promise<EndoGreeter>;
  gateway(): Promise<EndoGateway>;
  sign(hexBytes: string): Promise<string>;
  getPeerInfo(): Promise<PeerInfo>;
  addPeerInfo(peerInfo: PeerInfo): Promise<void>;
  listKnownPeers(): Promise<PeerInfo[]>;
  followPeerChanges(): AsyncGenerator<PetStoreNameChange, undefined, undefined>;
  makeChannel(
    petName: string | string[],
    proposedName: string,
  ): Promise<EndoChannel>;
  makeTimer(
    petName: string | string[],
    intervalMs: number,
    label?: string,
  ): Promise<unknown>;
  /** Locate a formula with connection hints. */
  locateWithHints(...petNamePath: string[]): Promise<string | undefined>;
  /** Adopt a value from a locator that includes connection hints. */
  adoptFromLocator(
    locator: string,
    petNameOrPath: string | string[],
  ): Promise<void>;
  invite(guestName: string | string[]): Promise<Invitation>;
  accept(
    invitationLocator: string,
    guestName: string | string[],
  ): Promise<void>;
  endow(
    messageNumber: bigint,
    bindings: Record<string, string | string[]>,
    workerName?: string | string[],
    resultName?: string | string[],
  ): Promise<void>;
  submit(messageNumber: bigint, values: Record<string, unknown>): Promise<void>;
  sendValue: Mail['sendValue'];
  /**
   * Returns the privileged read-only diagnostics facet: formula
   * records, the formula dependency graph, and the error-trace
   * aggregator.
   *
   * Host-only by precedent: a guest must not be able to enumerate
   * the host's internal naming, peer relationships, or the formula
   * graph of capabilities it does not own. See
   * `designs/formula-inspector.md` and `daemon-retention-paths.md`
   * for the host-only authority rationale.
   *
   * (Named `diagnostics` rather than `inspector` because
   * `EndoInspector` already denotes the per-formula reference walker.)
   */
  diagnostics(): Promise<EndoDiagnostics>;
  /**
   * Snapshot every retention path from a GC root to the target,
   * identified by an endo:// locator. Pet-store edges along the
   * path render as `pet:<name>` labels; internal field edges
   * pass through (e.g. `worker`, `petStore`, `retention`).
   * See `designs/daemon-retention-paths.md` § Notation.
   */
  listRetentionPaths(
    locator: string,
  ): Promise<import('./graph.js').RetentionPath[]>;
  /**
   * Subscribe to retention-path changes for the target. The first
   * delta is a full `{ snapshot }`; subsequent deltas are
   * `{ added, removed }` diffs over a microtask-coalesced batch
   * window. Drop the returned far reference to release the
   * subscription, exactly as with `followNameChanges` and
   * `followLocatorNameChanges`.
   */
  followRetentionPaths(
    locator: string,
  ): AsyncGenerator<
    import('./retention-path-accumulator.js').RetentionPathDelta,
    undefined,
    undefined
  >;
}

/**
 * The privileged read-only diagnostics facet returned by
 * `EndoHost.diagnostics()`.
 */
export interface EndoDiagnostics {
  help(): string;
  /** Returns a snapshot of the formula dependency graph reachable from this agent's pet store. */
  getFormulaGraph(): Promise<{
    nodes: Array<{ id: FormulaIdentifier; type: string }>;
    edges: Array<{
      sourceId: FormulaIdentifier;
      targetId: FormulaIdentifier;
      label: string;
    }>;
  }>;
  /**
   * Retrieve the formula record for a local formula identifier.
   * Returns the formula type plus the type-specific metadata as a
   * normalized property record. Each property is either a literal
   * passable value, a single reference (formula identifier), or a
   * record of references (codeName-keyed).
   *
   * The identifier must name a formula local to this node;
   * cross-peer locators are rejected.
   */
  getFormula(identifier: FormulaIdentifier): Promise<FormulaRecord>;
  /** Returns a privileged Exo for inspecting the daemon's error-trace aggregate. */
  traces(): Promise<EndoTraces>;
}

export interface EndoTraces {
  help(): string;
  lookup(errorId: string): Promise<EndoTraceReport | undefined>;
  recent(opts?: {
    workerId?: string;
    limit?: number;
  }): Promise<EndoTraceReport[]>;
  clear(workerId?: string): Promise<void>;
  stats(): Promise<{
    workers: number;
    totalRecords: number;
    bytes: number;
    aliases: number;
  }>;
}

export interface EndoTraceCauseRef {
  errorId: string;
  name: string;
  message: string;
}

export interface EndoTraceReport {
  errorId: string;
  workerId: string;
  name: string;
  message: string;
  stack: string;
  annotations: string[];
  causes: EndoTraceReport[];
  related: EndoTraceReport[];
  t: number;
  site: string;
  compartmentId?: string;
  partial: boolean;
}

export interface EndoHostController extends Controller<FarRef<EndoHost>> {}

export interface EndoChannel {
  help(topic?: string): string;
  post(
    strings: string[],
    names: string[],
    petNamesOrPaths: (string | string[])[],
    replyTo?: string,
  ): Promise<void>;
  followMessages(): AsyncGenerator<ChannelMessage, undefined, undefined>;
  listMessages(): Promise<ChannelMessage[]>;
  createInvitation(
    proposedName: string,
  ): Promise<[EndoChannelInvitation, EndoChannelAttenuator]>;
  join(proposedName: string): Promise<EndoChannelMember>;

  getMembers(): Promise<
    Array<{ proposedName: string; pedigree: string[]; active: boolean }>
  >;
  getProposedName(): string;
  getMemberId(): string;
  getMember(memberId: string): Promise<
    | {
        proposedName: string;
        invitedAs: string;
        memberId: string;
        pedigree: string[];
        pedigreeMemberIds: string[];
      }
    | undefined
  >;
  getAttenuator(invitedAs: string): Promise<EndoChannelAttenuator>;
  getHeatConfig(): Promise<HeatConfig | null>;
  getHopInfo(): Promise<HopInfo>;
  followHeatEvents(): Promise<AsyncIterableIterator<HeatEvent>>;
}

export interface EndoChannelInvitation {
  help(topic?: string): string;
  join(proposedName: string): Promise<EndoChannelMember>;
}

export interface HeatConfig {
  burstLimit: number;
  sustainedRate: number;
  lockoutDurationMs: number;
  postLockoutPct: number;
}

export interface HopPolicy {
  hopIndex: number;
  label: string;
  memberId: string;
  burstLimit: number;
  sustainedRate: number;
  lockoutDurationMs: number;
  postLockoutPct: number;
}

export interface HopState {
  hopIndex: number;
  heat: number;
  locked: boolean;
  lockRemaining: number;
}

export interface HeatEvent {
  type: 'heat' | 'snapshot';
  hopMemberId: string;
  heat: number;
  locked: boolean;
  lockEndTime: number;
  timestamp: number;
}

export interface HopInfo {
  policies: HopPolicy[];
  states: HopState[];
}

export interface EndoChannelAttenuator {
  setInvitationValidity(valid: boolean): Promise<void>;
  setHeatConfig(config: HeatConfig): Promise<void>;
  getHeatConfig(): Promise<HeatConfig | null>;
  temporaryBan(seconds: number): Promise<void>;
}

export interface EndoChannelMember {
  help(topic?: string): string;
  post(
    strings: string[],
    names: string[],
    petNamesOrPaths: (string | string[])[],
    replyTo?: string,
  ): Promise<void>;
  followMessages(): AsyncGenerator<ChannelMessage, undefined, undefined>;
  listMessages(): Promise<ChannelMessage[]>;
  createInvitation(
    proposedName: string,
  ): Promise<[EndoChannelInvitation, EndoChannelAttenuator]>;
  getMembers(): Promise<
    Array<{ proposedName: string; pedigree: string[]; active: boolean }>
  >;
  getProposedName(): string;
  getMemberId(): string;
  setProposedName(newName: string): Promise<void>;
  getMember(memberId: string): Promise<
    | {
        proposedName: string;
        invitedAs: string;
        memberId: string;
        pedigree: string[];
        pedigreeMemberIds: string[];
      }
    | undefined
  >;
  getAttenuator(invitedAs: string): Promise<EndoChannelAttenuator>;
  getHeatConfig(): Promise<HeatConfig | null>;
  getHopInfo(): Promise<HopInfo>;
  followHeatEvents(): Promise<AsyncIterableIterator<HeatEvent>>;
}

/**
 * Internal per-formula-type metadata facet retained for backward
 * compatibility with existing `pet-inspector` formulas already
 * persisted on disk. This type is internal: it is declared in
 * `packages/daemon/src/types.d.ts` and is not re-exported through the
 * package's public type surface in `packages/daemon/types.d.ts`. User
 * agents should use `EndoHost.getFormula(identifier)`; the inspector
 * facet remains only because the `pet-inspector` formula entries that
 * already exist on disk still need to revive into something callable.
 * See `designs/formula-inspector.md`.
 *
 * Removal target: once a daemon migration retires the on-disk
 * `pet-inspector` formula entries (no earlier than `@endo/daemon@4.0.0`),
 * both `EndoInspector` and `KnownEndoInspectors` go with them.
 *
 * @deprecated Internal. Use `EndoHost.getFormula(identifier)` instead.
 *   Removal scheduled with the on-disk `pet-inspector` retirement, no
 *   earlier than `@endo/daemon@4.0.0`.
 */
export type EndoInspector<RecordT = string> = {
  lookup(petNameOrPath: RecordT | NameOrPath): Promise<unknown>;
  list(): RecordT[];
};

/**
 * @deprecated Internal. Use `EndoHost.getFormula(identifier)` instead.
 *   Removal scheduled with the on-disk `pet-inspector` retirement, no
 *   earlier than `@endo/daemon@4.0.0`. See `EndoInspector`.
 */
export type KnownEndoInspectors = {
  eval: EndoInspector<'endowments' | 'source' | 'worker'>;
  'make-unconfined': EndoInspector<'host'>;
  'make-archive': EndoInspector<'archive' | 'powers' | 'worker'>;
  'make-from-tree': EndoInspector<'tree' | 'powers' | 'worker'>;
  guest: EndoInspector<'bundle' | 'powers'>;
  // This is an "empty" inspector, in that there is nothing to `lookup()` or `list()`.
  [formulaType: string]: EndoInspector<any>;
};

/**
 * A run of newly read text from one of the daemon's log files, as
 * streamed by `EndoBootstrap.readLog`.
 */
export type LogChunk = {
  /** Display name of the source log, e.g. `endo.log` or `worker/<id8>`. */
  source: string;
  /** A run of UTF-8 text read from that log. */
  chunk: string;
};

/**
 * A property of a `FormulaRecord` is either a literal passable
 * value, a single reference to another formula, or a record of
 * references keyed by a code-name (for example, the `endowments`
 * of an `eval` formula).
 */
export type FormulaProperty =
  | { kind: 'literal'; value: Passable }
  | { kind: 'reference'; identifier: FormulaIdentifier }
  | { kind: 'reference-list'; entries: Record<string, FormulaIdentifier> };

/**
 * The normalized formula record returned by `EndoHost.getFormula`.
 * `type` is one of the canonical formula types per
 * `packages/daemon/src/formula-type.js`. `number` is the 128-character
 * hex formula number. `properties` are the per-type metadata.
 */
export type FormulaRecord = {
  type: string;
  number: FormulaNumber;
  properties: Record<string, FormulaProperty>;
};

export type EndoBootstrap = {
  ping: () => Promise<string>;
  terminate: () => Promise<void>;
  host: () => Promise<EndoHost>;
  leastAuthority: () => Promise<EndoGuest>;
  greeter: () => Promise<EndoGreeter>;
  gateway: () => Promise<EndoGateway>;
  nodeId: () => string;
  sign: (hexBytes: string) => Promise<string>;
  readLog: (options?: {
    name?: string;
    pattern?: string;
    follow?: boolean;
  }) => Promise<import('@endo/exo-stream').PassableReader<LogChunk, undefined>>;
  reviveNetworks: () => Promise<void>;
  revivePins: () => Promise<void>;
  addPeerInfo: (peerInfo: PeerInfo) => Promise<void>;
  listKnownPeers: () => Promise<PeerInfo[]>;
  followPeerChanges: () => Promise<
    AsyncGenerator<PetStoreNameChange, undefined, undefined>
  >;
};

export type CryptoPowers = {
  makeSha256: () => Sha256;
  randomHex256: () => Promise<string>;
  generateEd25519Keypair: () => Promise<Ed25519Keypair>;
  ed25519Sign: (privateKey: Uint8Array, message: Uint8Array) => Uint8Array;
};

export type FilePowers = {
  makeFileReader: (path: string) => Reader<Uint8Array>;
  makeFileWriter: (path: string) => Writer<Uint8Array>;
  writeFileText: (path: string, text: string) => Promise<void>;
  appendFileText: (path: string, text: string) => Promise<void>;
  readFileText: (path: string) => Promise<string>;
  readFileBytes: (path: string) => Promise<Uint8Array>;
  readFile: (path: string) => Promise<Uint8Array>;
  readFileRange: (
    path: string,
    offset: number,
    length: number,
  ) => Promise<Uint8Array>;
  sha256: (path: string) => Promise<string>;
  maybeReadFile: (path: string) => Promise<Uint8Array | undefined>;
  maybeReadFileText: (path: string) => Promise<string | undefined>;
  readDirectory: (path: string) => Promise<Array<string>>;
  makePath: (path: string) => Promise<void>;
  joinPath: (...components: Array<string>) => string;
  removePath: (path: string) => Promise<void>;
  removeDirectory: (path: string) => Promise<void>;
  renamePath: (source: string, target: string) => Promise<void>;
  realPath: (path: string) => Promise<string>;
  // Optional: only the XS-backed powers surface readLink today; the
  // Node powers omit it. Declared here so the XS factory's return value
  // structurally satisfies FilePowers without an excess-property error.
  readLink?: (path: string) => Promise<string | undefined>;
  pathIdentity: (path: string) => Promise<string>;
  statPath: (path: string) => Promise<{
    kind: 'file' | 'directory' | 'symlink';
    size: bigint;
    mtime: bigint;
    atime: bigint;
  }>;
  isDirectory: (path: string) => Promise<boolean>;
  exists: (path: string) => Promise<boolean>;
  /**
   * Watch a directory for entry-name changes (children added or
   * removed).  The returned `events` stream yields one record per
   * coalesced filesystem event; the `kind` field is a hint that the
   * consumer reconciles against its own snapshot set to decide
   * whether the entry was genuinely added, removed, or unchanged.
   * `cancel()` closes the OS-level watcher handle and terminates
   * `events`.  `cancel()` is idempotent.
   *
   * On platforms or filesystems where `fs.watch` is unavailable, the
   * implementation logs to `console.error` and returns an `events`
   * stream that terminates immediately so callers see end-of-stream
   * rather than hang.
   */
  watchDirectory: (path: string) => {
    events: AsyncIterable<{
      kind: 'add' | 'remove' | 'replace';
      name: string;
    }>;
    cancel: () => void;
  };
};

export type AssertValidNameFn = (name: string) => void;

export type DaemonDatabase = import('./daemon-database.js').DaemonDatabase;

export type PetStorePowers = {
  makeIdentifiedPetStore: (
    id: string,
    formulaType: 'pet-store' | 'known-peers-store' | 'mailbox-store',
    assertValidName: AssertValidNameFn,
  ) => Promise<PetStore>;
  deletePetStore: (
    formulaNumber: FormulaNumber,
    formulaType: string,
  ) => Promise<void>;
};

export type SocketPowers = {
  servePort: (args: {
    port: number;
    host?: string;
    cancelled: Promise<never>;
  }) => Promise<{
    port: number;
    connections: Reader<Connection>;
  }>;
  connectPort: (args: {
    port: number;
    host?: string;
    cancelled: Promise<never>;
  }) => Promise<Connection>;
  servePath: (args: {
    path: string;
    cancelled: Promise<never>;
  }) => Promise<AsyncIterableIterator<Connection>>;
};

export type CapTpConnectionRegistrar = (args: {
  name: string;
  close: (reason?: Error) => Promise<void>;
  closed: Promise<void>;
}) => CapTPOptions;

export type NetworkPowers = SocketPowers & {
  makePrivatePathService: (
    endoBootstrap: FarRef<EndoBootstrap>,
    sockPath: string,
    cancelled: Promise<never>,
    exitWithError: (error: Error) => void,
    capTpConnectionRegistrar?: CapTpConnectionRegistrar,
    marshalSaveError?: (err: Error, errorId?: string) => void,
  ) => { started: Promise<void>; stopped: Promise<void> };
};

export type RootNonceDescriptor = {
  rootNonce: FormulaNumber;
  isNewlyCreated: boolean;
};

export type RootKeypairDescriptor = {
  keypair: Ed25519Keypair;
  isNewlyCreated: boolean;
};

export type AgentKeyRecord = {
  publicKey: string;
  privateKey: string;
  agentId: string;
};

export type DaemonicPersistencePowers = {
  statePath: string;
  initializePersistence: () => Promise<void>;
  provideRootNonce: () => Promise<RootNonceDescriptor>;
  provideRootKeypair: () => Promise<RootKeypairDescriptor>;
  makeContentStore: () => import('@endo/platform/fs/lite/types').SnapshotStore;
  readFormula: (
    formulaNumber: FormulaNumber,
  ) => Promise<{ node: string; formula: Formula }>;
  writeFormula: (
    formulaNumber: FormulaNumber,
    nodeNumber: string,
    formula: Formula,
  ) => Promise<void>;
  deleteFormula: (formulaNumber: FormulaNumber) => Promise<void>;
  listFormulas: () => Promise<Array<{ number: string; node: string }>>;
  listFormulaNumbersByNode: (nodeNumber: string) => string[];
  writeAgentKey: (
    publicKey: string,
    privateKey: string,
    agentId: string,
  ) => void;
  getAgentKey: (publicKey: string) => AgentKeyRecord | undefined;
  hasAgentKey: (publicKey: string) => boolean;
  listAgentKeys: () => AgentKeyRecord[];
  deleteAgentKey: (publicKey: string) => void;
  writeRemoteAgentKey: (publicKey: string, daemonNode: string) => void;
  getRemoteAgentKey: (publicKey: string) => string | undefined;
  writeRetention: (guestPublicKey: string, formulaNumber: string) => void;
  deleteRetention: (guestPublicKey: string, formulaNumber: string) => void;
  listRetention: (guestPublicKey: string) => Array<{ formulaNumber: string }>;
  replaceRetention: (guestPublicKey: string, formulaNumbers: string[]) => void;
  deleteAllRetention: (guestPublicKey: string) => void;
};

export interface DaemonWorkerFacet {}

export interface WorkerDaemonFacet {
  terminate(): Promise<void>;
  evaluate(
    source: string,
    names: Array<string>,
    values: Array<unknown>,
    id: FormulaIdentifier,
    cancelled: Promise<never>,
  ): Promise<unknown>;
  makeArchive(
    archive: ERef<EndoReadable>,
    powers: ERef<unknown>,
    context: ERef<FarContext>,
  ): Promise<unknown>;
  makeUnconfined(
    path: string,
    powers: ERef<unknown>,
    context: ERef<FarContext>,
  ): Promise<unknown>;
}

export type DaemonicControlPowers = {
  makeWorker: (
    id: string,
    daemonWorkerFacet: DaemonWorkerFacet,
    cancelled: Promise<never>,
    forceCancelled: Promise<never>,
    capTpConnectionRegistrar?: CapTpConnectionRegistrar,
    trustedShims?: string[],
    label?: string,
    kind?: 'locked' | 'node',
    marshalLoadError?: (err: Error, errorId?: string) => void,
  ) => Promise<{
    workerTerminated: Promise<void>;
    workerDaemonFacet: ERef<WorkerDaemonFacet>;
  }>;
  /**
   * Only present in the Go supervisor (engo) variant.
   * Starts reading envelopes from fd 4 after the init envelope has
   * been consumed.
   */
  startEnvelopeReader?: () => void;
  /**
   * Attach a debugger to a running worker (Rust supervisor only).
   * Returns a Debugger exo that wraps the xsbug debug session
   * and is remotable over CapTP.
   */
  attachDebugger?: (workerHandle: number) => Promise<Debugger>;
  /**
   * Detach a debugger from a running worker (Rust supervisor only).
   */
  detachDebugger?: (workerHandle: number) => void;
};

export type DaemonicPowers = {
  crypto: CryptoPowers;
  petStore: PetStorePowers;
  persistence: DaemonicPersistencePowers;
  control: DaemonicControlPowers;
  filePowers: FilePowers;
};

export type FormulateResult<T> = Promise<{
  id: FormulaIdentifier;
  value: T;
}>;

export type DeferredTask<T extends Record<string, string | string[]>> = (
  ids: Readonly<T>,
) => Promise<void>;

/**
 * A collection of deferred tasks (i.e. async functions) that can be executed in
 * parallel.
 */
export type DeferredTasks<T extends Record<string, string | string[]>> = {
  execute(identifiers?: Readonly<T>): Promise<void>;
  push(value: DeferredTask<T>): void;
};

type FormulateNumberedGuestParams = {
  guestFormulaNumber: FormulaNumber;
  handleId: FormulaIdentifier;
  agentNodeNumber: NodeNumber;
  guestId: FormulaIdentifier;
  hostAgentId: FormulaIdentifier;
  hostHandleId: FormulaIdentifier;
  storeId: FormulaIdentifier;
  mailboxStoreId: FormulaIdentifier;
  mailHubId: FormulaIdentifier;
  workerId: FormulaIdentifier;
  networksDirectoryId: FormulaIdentifier;
  pinned: FormulaIdentifier[];
};

type FormulateHostDependenciesParams = {
  endoId: FormulaIdentifier;
  networksDirectoryId: FormulaIdentifier;
  pinsDirectoryId: FormulaIdentifier;
  specifiedWorkerId?: FormulaIdentifier | undefined;
  hostHandleId?: FormulaIdentifier | undefined;
  workerLabel?: string | undefined;
};

type FormulateNumberedHostParams = {
  hostFormulaNumber: FormulaNumber;
  hostId: FormulaIdentifier;
  handleId: FormulaIdentifier;
  hostHandleId: FormulaIdentifier;
  agentNodeNumber: NodeNumber;
  mainWorkerId: FormulaIdentifier;
  nodeWorkerId: FormulaIdentifier;
  storeId: FormulaIdentifier;
  mailboxStoreId: FormulaIdentifier;
  mailHubId: FormulaIdentifier;
  inspectorId: FormulaIdentifier;
  endoId: FormulaIdentifier;
  networksDirectoryId: FormulaIdentifier;
  pinsDirectoryId: FormulaIdentifier;
  pinned: FormulaIdentifier[];
};

export type FormulaValueTypes = {
  directory: EndoDirectory;
  mount: EndoMount;
  network: EndoNetwork;
  peer: EndoGateway;
  'pet-store': PetStore;
  'mailbox-store': PetStore;
  'mail-hub': NameHub;
  message: NameHub;
  promise: string;
  'readable-blob': EndoReadable;
  resolver: Responder;
  endo: EndoBootstrap;
  guest: EndoGuest;
  handle: Handle;
  host: EndoHost;
  invitation: Invitation;
  worker: EndoWorker;
};

export type ProvideTypes = FormulaValueTypes & {
  agent: EndoAgent;
  hub: NameHub;
};

export type Provide = <T extends keyof ProvideTypes, U extends ProvideTypes[T]>(
  id: FormulaIdentifier,
  expectedType?: T,
) => Promise<U>;

export interface DaemonCore {
  cancelValue: (id: FormulaIdentifier, reason: Error) => Promise<void>;

  formulate: (
    formulaNumber: FormulaNumber,
    formula: Formula,
    nodeNumber?: NodeNumber,
  ) => Promise<{
    id: FormulaIdentifier;
    value: unknown;
  }>;

  formulateArchive: (
    hostAgentId: FormulaIdentifier,
    hostHandleId: FormulaIdentifier,
    archiveId: FormulaIdentifier,
    deferredTasks: DeferredTasks<MakeCapletDeferredTaskParams>,
    specifiedWorkerId?: FormulaIdentifier,
    specifiedPowersId?: FormulaIdentifier,
    env?: Record<string, string>,
    trustedShims?: string[],
    workerLabel?: string,
  ) => FormulateResult<unknown>;

  formulateFromTree: (
    hostAgentId: FormulaIdentifier,
    hostHandleId: FormulaIdentifier,
    treeId: FormulaIdentifier,
    deferredTasks: DeferredTasks<MakeCapletDeferredTaskParams>,
    specifiedWorkerId?: FormulaIdentifier,
    specifiedPowersId?: FormulaIdentifier,
    env?: Record<string, string>,
    trustedShims?: string[],
    workerLabel?: string,
  ) => FormulateResult<unknown>;

  formulateDirectory: (
    nodeNumber?: NodeNumber,
  ) => FormulateResult<EndoDirectory>;

  formulateDirectoryForStore: (
    storeId: FormulaIdentifier,
  ) => FormulateResult<EndoDirectory>;

  getPeerIdForNodeIdentifier: (
    nodeNumber: NodeNumber,
  ) => Promise<FormulaIdentifier>;

  formulateEndo: (
    specifiedFormulaNumber?: FormulaNumber,
  ) => FormulateResult<FarRef<EndoBootstrap>>;

  formulateMarshalValue: (
    value: Passable,
    deferredTasks: DeferredTasks<MarshalDeferredTaskParams>,
    pin?: (id: FormulaIdentifier) => void,
  ) => FormulateResult<void>;

  formulatePromise: (
    pinTransient?: (id: FormulaIdentifier) => void,
  ) => Promise<{
    promiseId: FormulaIdentifier;
    resolverId: FormulaIdentifier;
  }>;

  pinTransient: (id: FormulaIdentifier) => void;
  unpinTransient: (id: FormulaIdentifier) => void;

  formulateMessage: (
    messageFormula: MessageFormula,
    pin?: (id: FormulaIdentifier) => void,
  ) => FormulateResult<NameHub>;

  formulateEval: (
    nameHubId: FormulaIdentifier,
    source: string,
    codeNames: Array<string>,
    endowmentIdsOrPaths: (FormulaIdentifier | NamePath)[],
    deferredTasks: DeferredTasks<EvalDeferredTaskParams>,
    specifiedWorkerId?: FormulaIdentifier,
    pin?: (id: FormulaIdentifier) => void,
    workerLabel?: string,
  ) => FormulateResult<unknown>;

  formulateGuest: (
    hostId: FormulaIdentifier,
    hostHandleId: FormulaIdentifier,
    deferredTasks: DeferredTasks<AgentDeferredTaskParams>,
    workerLabel?: string,
  ) => FormulateResult<EndoGuest>;

  /**
   * Helper for callers of {@link formulateNumberedGuest}.
   * @param hostAgentId - The formula identifier of the host agent.
   * @param hostHandleId - The formula identifier of the host handle.
   * @param workerLabel - Optional label for the guest worker.
   * @returns The formula identifiers for the guest formulation's dependencies.
   */
  formulateGuestDependencies: (
    hostAgentId: FormulaIdentifier,
    hostHandleId: FormulaIdentifier,
    workerLabel?: string,
  ) => Promise<Readonly<FormulateNumberedGuestParams>>;

  formulateChannel: (
    creatorAgentId: FormulaIdentifier,
    handleId: FormulaIdentifier,
    proposedName: string,
    deferredTasks: DeferredTasks<ChannelDeferredTaskParams>,
  ) => FormulateResult<EndoChannel>;

  formulateTimer: (
    intervalMs: number,
    label: string,
    deferredTasks: DeferredTasks<{ timerId: FormulaIdentifier }>,
  ) => FormulateResult<unknown>;

  formulateHost: (
    endoId: FormulaIdentifier,
    networksDirectoryId: FormulaIdentifier,
    pinsDirectoryId: FormulaIdentifier,
    deferredTasks: DeferredTasks<AgentDeferredTaskParams>,
    specifiedWorkerId?: FormulaIdentifier | undefined,
    hostHandleId?: FormulaIdentifier,
    workerLabel?: string,
  ) => FormulateResult<EndoHost>;

  /**
   * Helper for callers of {@link formulateNumberedHost}.
   * @param specifiedIdentifiers - The existing formula identifiers specified to the host formulation.
   * @returns The formula identifiers for all of the host formulation's dependencies.
   */
  formulateHostDependencies: (
    specifiedIdentifiers: FormulateHostDependenciesParams,
  ) => Promise<Readonly<FormulateNumberedHostParams>>;

  formulateLoopbackNetwork: () => FormulateResult<EndoNetwork>;

  formulateNetworksDirectory: () => FormulateResult<EndoDirectory>;

  getFormulaForId: (id: FormulaIdentifier) => Promise<Formula>;

  formulateNumberedGuest: (
    identifiers: FormulateNumberedGuestParams,
  ) => FormulateResult<EndoGuest>;

  formulateNumberedHost: (
    identifiers: FormulateNumberedHostParams,
  ) => FormulateResult<EndoHost>;

  formulatePeer: (
    networksId: FormulaIdentifier,
    nodeNumber: NodeNumber,
    addresses: Array<string>,
  ) => FormulateResult<EndoPeer>;

  formulateReadableBlob: (
    readerRef: ERef<PassableBytesReader>,
    deferredTasks: DeferredTasks<ReadableBlobDeferredTaskParams>,
  ) => FormulateResult<FarRef<EndoReadable>>;

  checkinTree: (
    remoteTree: unknown,
    deferredTasks: DeferredTasks<ReadableTreeDeferredTaskParams>,
  ) => FormulateResult<unknown>;

  formulateMount: (
    mountPath: string,
    readOnly: boolean,
    deferredTasks: DeferredTasks<MountDeferredTaskParams>,
  ) => FormulateResult<EndoMount>;

  formulateScratchMount: (
    readOnly: boolean,
    deferredTasks: DeferredTasks<ScratchMountDeferredTaskParams>,
  ) => FormulateResult<EndoMount>;

  formulateGit: (
    mountId: FormulaIdentifier,
    deferredTasks: DeferredTasks<GitDeferredTaskParams>,
  ) => FormulateResult<EndoGit>;

  formulateShell: (
    mountId: FormulaIdentifier,
    policy: ShellPolicy,
    deferredTasks: DeferredTasks<ShellDeferredTaskParams>,
  ) => FormulateResult<EndoShell>;

  formulateGitCredential: (
    kind: GitCredentialFormula['kind'],
    audience: string,
    material: Record<string, string>,
    deferredTasks: DeferredTasks<GitCredentialDeferredTaskParams>,
  ) => FormulateResult<unknown>;

  formulateGitRemote: (
    gitId: FormulaIdentifier,
    credentialId: FormulaIdentifier | undefined,
    name: string,
    policy: GitRemoteFormula['policy'],
    deferredTasks: DeferredTasks<GitRemoteDeferredTaskParams>,
  ) => FormulateResult<GitRemote>;

  formulateInvitation: (
    hostAgentId: FormulaIdentifier,
    hostHandleId: FormulaIdentifier,
    guestName: NameOrPath,
    deferredTasks: DeferredTasks<InvitationDeferredTaskParams>,
  ) => FormulateResult<Invitation>;

  formulateUnconfined: (
    hostAgentId: FormulaIdentifier,
    hostHandleId: FormulaIdentifier,
    specifier: string,
    deferredTasks: DeferredTasks<MakeCapletDeferredTaskParams>,
    specifiedWorkerId?: FormulaIdentifier,
    specifiedPowersId?: FormulaIdentifier,
    env?: Record<string, string>,
    trustedShims?: string[],
    workerLabel?: string,
  ) => FormulateResult<unknown>;

  formulateWorker: (
    deferredTasks: DeferredTasks<WorkerDeferredTaskParams>,
    trustedShims?: string[],
    label?: string,
  ) => FormulateResult<EndoWorker>;

  getAllNetworkAddresses: (
    networksDirectoryId: FormulaIdentifier,
  ) => Promise<string[]>;

  getIdForRef: (ref: unknown) => FormulaIdentifier | undefined;

  /**
   * Privileged accessor that returns the host filesystem path of a
   * `mount` or `scratch-mount` formula.  The daemon hands this to
   * `makeHostMaker` so the `EndoHost.provideHostPath` method (used
   * by the @endo/sandbox factory) can resolve granted Mount caps to
   * bind-mount source paths without exposing the path on Mount's
   * public surface.
   */
  getMountHostPath: (id: FormulaIdentifier) => string;

  getTypeForId: (id: FormulaIdentifier) => Promise<string>;

  makeDirectoryNode: MakeDirectoryNode;

  makeMailbox: MakeMailbox;

  provide: Provide;

  provideStoreController: (id: FormulaIdentifier) => Promise<StoreController>;

  provideAgentForHandle: (id: string) => Promise<ERef<EndoAgent>>;

  getAgentIdForHandleId: (
    handleId: FormulaIdentifier,
  ) => Promise<FormulaIdentifier>;

  getFormulaGraphSnapshot: (seedIds: FormulaIdentifier[]) => Promise<{
    nodes: Array<{ id: FormulaIdentifier; type: string }>;
    edges: Array<{
      sourceId: FormulaIdentifier;
      targetId: FormulaIdentifier;
      label: string;
    }>;
  }>;
  listRetentionPaths: (
    targetId: FormulaIdentifier,
  ) => Promise<import('./graph.js').RetentionPath[]>;
  followRetentionPaths: (
    targetId: FormulaIdentifier,
  ) => AsyncGenerator<
    import('./retention-path-accumulator.js').RetentionPathDelta,
    undefined,
    undefined
  >;
  provideController: (id: FormulaIdentifier) => Controller;
}

export interface DaemonCoreExternal {
  formulateEndo: DaemonCore['formulateEndo'];
  nodeNumber: NodeNumber;
  provide: DaemonCore['provide'];
  capTpConnectionRegistrar: CapTpConnectionRegistrar;
}

export type SerialJobs = {
  enqueue: <T>(fn?: () => T | Promise<T>) => Promise<T>;
};

export type Multimap<K, V> = {
  /**
   * @param key - The key to add a value for.
   * @param value - The value to add.
   */
  add(key: K, value: V): void;

  /**
   * @param key - The key whose value to delete.
   * @param value - The value to delete.
   * @returns `true` if the key was found and the value was deleted, `false` otherwise.
   */
  delete(key: K, value: V): boolean;

  /**
   * @param key - The key whose values to delete
   * @returns `true` if the key was found and its values were deleted, `false` otherwise.
   */
  deleteAll(key: K): boolean;

  /**
   * @param key - The key whose first value to retrieve
   * @returns The first value associated with the key.
   */
  get(key: K): V | undefined;

  /**
   * @param key - The key whose values to retrieve.
   * @returns An array of all values associated with the key.
   */
  getAllFor(key: K): V[];

  /**
   * @param key - The key whose presence to check for.
   * @returns `true` if the key is present and `false` otherwise.
   */
  has(key: K): boolean;
};

/**
 * A multimap backed by a WeakMap.
 */
export type WeakMultimap<K extends WeakKey, V> = Multimap<K, V>;

export type BidirectionalMultimap<K, V> = {
  /**
   * @param key - The key to add a value for.
   * @param value - The value to add.
   * @throws If the value has already been added for a different key.
   */
  add(key: K, value: V): void;

  /**
   * @param key - The key whose value to delete.
   * @param value - The value to delete.
   * @returns `true` if the key was found and the value was deleted, `false` otherwise.
   */
  delete(key: K, value: V): boolean;

  /**
   * @param key - The key whose values to delete.
   * @returns `true` if the key was found and its values were deleted, `false` otherwise.
   */
  deleteAll(key: K): boolean;

  /**
   * @param key - The key whose presence to check for.
   * @returns `true` if the key is present and `false` otherwise.
   */
  has(key: K): boolean;

  /**
   * @param value - The value whose presence to check for.
   * @returns `true` if the value is present and `false` otherwise.
   */
  hasValue(value: V): boolean;

  /**
   * @param key - The key whose first value to retrieve.
   * @returns The first value associated with the key.
   */
  get(key: K): V | undefined;

  /**
   * @param value - The value whose key to retrieve.
   * @returns The key associated with the value.
   */
  getKey(value: V): K | undefined;

  /**
   * @returns An array of all values, for all keys.
   */
  getAll(): V[];

  /**
   * @param key - The key whose values to retrieve.
   * @returns An array of all values associated with the key.
   */
  getAllFor(key: K): V[];
};

export type ParsedCIDR =
  | { type: 'ipv4'; network: number[]; prefixLen: number }
  | { type: 'ipv6'; network: number[]; prefixLen: number };

export type AddressChecker = (remoteAddress: string) => boolean;

export interface RemoteControl {
  accept(
    remoteGateway: ERef<EndoGateway>,
    cancel: (error: Error) => void | Promise<void>,
    cancelled: Promise<never>,
    dispose?: () => void,
  ): void;
  connect(
    getRemoteGateway: () => ERef<EndoGateway>,
    cancel: (error: Error) => void | Promise<void>,
    cancelled: Promise<never>,
    dispose?: () => void,
  ): ERef<EndoGateway>;
  getStateName(): string;
}

// ---------------------------------------------------------------------------
// SQLite
// ---------------------------------------------------------------------------

export type SqliteValue = null | bigint | number | string | Uint8Array;

export type SqliteParams = SqliteValue[] | [Record<string, SqliteValue>];

export interface StatementSync {
  run(...params: SqliteParams): { changes: bigint; lastInsertRowid: bigint };
  get(...params: SqliteParams): Record<string, SqliteValue> | undefined;
  all(...params: SqliteParams): Array<Record<string, SqliteValue>>;
  columns(): Array<{ name: string; type: string | null }>;
  finalize(): void;
}

export interface DatabaseSync {
  close(): void;
  exec(sql: string): void;
  prepare(sql: string): StatementSync;
  readonly open: boolean;
}

export interface SqlitePowers {
  openDatabase(path: string): DatabaseSync;
}

// ---------------------------------------------------------------------------
// Debugger
// ---------------------------------------------------------------------------

export interface BreakEvent {
  readonly path: string;
  readonly line: number;
  readonly message: string;
}

export interface Frame {
  readonly name: string;
  readonly value: string;
  readonly path: string;
  readonly line: number;
}

export interface Property {
  readonly name: string;
  readonly value: string;
  readonly flags: string;
  readonly children?: Property[];
}

export interface DebugSession {
  feedXml(bytes: Uint8Array): void;
  go(): void;
  step(): Promise<BreakEvent>;
  stepIn(): Promise<BreakEvent>;
  stepOut(): Promise<BreakEvent>;
  abort(): void;
  setBreakpoint(path: string, line: number): void;
  clearBreakpoint(path: string, line: number): void;
  clearAllBreakpoints(): void;
  getFrames(): Promise<Frame[]>;
  getLocals(): Promise<Property[]>;
  getGlobals(): Promise<Property[]>;
  selectFrame(id: string): Promise<Property[]>;
  toggleProperty(id: string): Promise<Property[]>;
  evaluate(source: string): Promise<string>;
  startProfiling(): void;
  stopProfiling(): void;
  setExceptionBreakMode(mode: 'none' | 'all' | 'uncaught'): void;
  onBreak(listener: (event: BreakEvent) => void): () => void;
  isBroken(): boolean;
  getTitle(): string | undefined;
  getTag(): string | undefined;
  getLastBreak(): BreakEvent | null;
  help(): string;
}

/**
 * Remotable debugger exo — a CapTP-safe wrapper around DebugSession.
 * Methods match DebugSession but omit `feedXml` and `onBreak`
 * (which are not serialisable over CapTP).
 */
export interface Debugger {
  help(): string;
  go(): void;
  step(): Promise<BreakEvent>;
  stepIn(): Promise<BreakEvent>;
  stepOut(): Promise<BreakEvent>;
  abort(): void;
  setBreakpoint(path: string, line: number): void;
  clearBreakpoint(path: string, line: number): void;
  clearAllBreakpoints(): void;
  getFrames(): Promise<Frame[]>;
  getLocals(): Promise<Property[]>;
  getGlobals(): Promise<Property[]>;
  selectFrame(id: string): Promise<Property[]>;
  toggleProperty(id: string): Promise<Property[]>;
  evaluate(source: string): Promise<string>;
  setExceptionBreakMode(mode: 'none' | 'all' | 'uncaught'): void;
  isBroken(): boolean;
  getTitle(): string | undefined;
  getTag(): string | undefined;
  getLastBreak(): BreakEvent | null;
}

export interface RemoteControlState {
  accept(
    remoteGateway: ERef<EndoGateway>,
    cancel: (error: Error) => void | Promise<void>,
    cancelled: Promise<never>,
    dispose: () => void,
  ): RemoteControlState;
  connect(
    getRemoteGateway: () => ERef<EndoGateway>,
    cancel: (error: Error) => void | Promise<void>,
    cancelled: Promise<never>,
    dispose: () => void,
  ): { state: RemoteControlState; remoteGateway: ERef<EndoGateway> };
}
