import type { Passable } from '@endo/pass-style';
import type { ERef } from '@endo/eventual-send';
import type { FarRef } from '@endo/far';
import type { CapTPOptions } from '@endo/captp';
import type { Reader, Writer, Stream } from '@endo/stream';

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

type IdRecord = {
  number: FormulaNumber;
  node: NodeNumber;
};

export type ParseIdRecord = IdRecord & {
  id: FormulaIdentifier;
};

export type EdgeName = string;

export type EnvRecord = Record<string, string>;

type EndoFormula = {
  type: 'endo';
  networks: FormulaIdentifier;
  pins: FormulaIdentifier;
  peers: FormulaIdentifier;
  host: FormulaIdentifier;
  leastAuthority: FormulaIdentifier;
};

type LoopbackNetworkFormula = {
  type: 'loopback-network';
};

type WorkerFormula = {
  type: 'worker';
  label?: string;
  trustedShims?: string[];
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
  worker: FormulaIdentifier;
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

type MarshalFormula = {
  type: 'marshal';
  body: any;
  slots: Array<FormulaIdentifier>;
};

type EvalFormula = {
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

type ReadableBlobFormula = {
  type: 'readable-blob';
  content: string;
};

export type ReadableBlobDeferredTaskParams = {
  readableBlobId: FormulaIdentifier;
};

type ReadableTreeFormula = {
  type: 'readable-tree';
  content: string;
};

export type ReadableTreeDeferredTaskParams = {
  readableTreeId: FormulaIdentifier;
};

type MountFormula = {
  type: 'mount';
  path: string;
  readOnly: boolean;
};

type ScratchMountFormula = {
  type: 'scratch-mount';
  readOnly: boolean;
};

export type MountDeferredTaskParams = {
  mountId: FormulaIdentifier;
};

export type ScratchMountDeferredTaskParams = {
  scratchMountId: FormulaIdentifier;
};

type LookupFormula = {
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

type MakeUnconfinedFormula = {
  type: 'make-unconfined';
  worker: FormulaIdentifier;
  powers: FormulaIdentifier;
  specifier: string;
  env?: Record<string, string>;
  // TODO formula slots
};

type MakeBundleFormula = {
  type: 'make-bundle';
  worker: FormulaIdentifier;
  powers: FormulaIdentifier;
  bundle: FormulaIdentifier;
  env?: Record<string, string>;
  // TODO formula slots
};

export type MakeCapletDeferredTaskParams = {
  capletId: FormulaIdentifier;
  powersId: FormulaIdentifier;
  workerId: FormulaIdentifier;
};

type PeerFormula = {
  type: 'peer';
  networks: FormulaIdentifier;
  node: NodeNumber;
  addresses: Array<string>;
};

type HandleFormula = {
  type: 'handle';
  agent: FormulaIdentifier;
};

type KnownPeersStoreFormula = {
  type: 'known-peers-store';
};

type PetStoreFormula = {
  type: 'pet-store';
};

type MailboxStoreFormula = {
  type: 'mailbox-store';
};

type MailHubFormula = {
  type: 'mail-hub';
  store: FormulaIdentifier;
};

type MessageFormula = {
  type: 'message';
  messageType:
    | 'request'
    | 'package'
    | 'eval-request'
    | 'definition'
    | 'form'
    | 'value';
  messageId: FormulaNumber;
  replyTo?: FormulaNumber;
  from: FormulaIdentifier;
  to: FormulaIdentifier;
  date: string;
  description?: string;
  promiseId?: FormulaIdentifier;
  resolverId?: FormulaIdentifier;
  strings?: string[];
  names?: string[];
  ids?: FormulaIdentifier[];
  source?: string;
  codeNames?: string[];
  petNamePaths?: NamePath[];
  slots?: Record<string, { label: string; pattern?: unknown }>;
  fields?: FormField[];
  valueId?: FormulaIdentifier;
};

// Pending is represented by the absence of a status entry in the promise store.
type PromiseFormula = {
  type: 'promise';
  store: FormulaIdentifier;
};

type ResolverFormula = {
  type: 'resolver';
  store: FormulaIdentifier;
};

type PetInspectorFormula = {
  type: 'pet-inspector';
  petStore: FormulaIdentifier;
};

type DirectoryFormula = {
  type: 'directory';
  petStore: FormulaIdentifier;
};

type ChannelFormula = {
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

type InvitationFormula = {
  type: 'invitation';
  hostAgent: FormulaIdentifier;
  hostHandle: FormulaIdentifier;
  guestName: PetName;
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
  | LookupFormula
  | MakeUnconfinedFormula
  | MakeBundleFormula
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
  dismissed: Promise<void>;
  dismisser: ERef<Dismisser>;
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
  | { add: Name; value: IdRecord }
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
  sha256(): string;
  streamBase64(): FarRef<Reader<string>>;
  text(): Promise<string>;
  json(): Promise<unknown>;
}
export interface EndoWorker {}

export type MakeHostOrGuestOptions = {
  agentName?: string;
  introducedNames?: Record<string, string>;
};

export type MakeCapletOptions = {
  powersName?: string;
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
    FarRef<
      AsyncIterableIterator<import('./retention-accumulator.js').RetentionDelta>
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
}

export interface EndoGuest extends EndoAgent {
  /** Evaluate code directly in a worker, constrained by reachable capabilities. */
  evaluate(
    workerPetName: string | undefined,
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
    readerRef: ERef<AsyncIterableIterator<string>>,
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
    readerRef: ERef<AsyncIterableIterator<string>>,
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
  ): Promise<unknown>;
  provideScratchMount(petName: string | string[]): Promise<unknown>;
  provideGuest(
    petName?: string,
    opts?: MakeHostOrGuestOptions,
  ): Promise<EndoGuest>;
  provideHost(
    petName?: string,
    opts?: MakeHostOrGuestOptions,
  ): Promise<EndoHost>;
  makeDirectory(petNamePath: string | string[]): Promise<EndoDirectory>;
  provideWorker(petNamePath: string | string[]): Promise<EndoWorker>;
  evaluate(
    workerPetName: string | undefined,
    source: string,
    codeNames: Array<string>,
    petNamesOrPaths: Array<string | string[]>,
    resultName?: string | string[],
  ): Promise<unknown>;
  makeUnconfined(
    workerName: string | undefined,
    specifier: string,
    options?: MakeCapletOptions,
  ): Promise<unknown>;
  makeBundle(
    workerPetName: string | undefined,
    bundleName: string,
    options?: MakeCapletOptions,
  ): Promise<unknown>;
  cancel(petNameOrPath: string | string[], reason?: Error): Promise<void>;
  greeter(): Promise<EndoGreeter>;
  gateway(): Promise<EndoGateway>;
  sign(hexBytes: string): Promise<string>;
  getPeerInfo(): Promise<PeerInfo>;
  addPeerInfo(peerInfo: PeerInfo): Promise<void>;
  listKnownPeers(): Promise<PeerInfo[]>;
  followPeerChanges(): AsyncGenerator<PetStoreNameChange, undefined, undefined>;
  makeChannel(petName: string, proposedName: string): Promise<EndoChannel>;
  makeTimer(
    petName: string,
    intervalMs: number,
    label?: string,
  ): Promise<unknown>;
  /** Locate a formula with connection hints for sharing with remote peers. */
  locateForSharing(...petNamePath: string[]): Promise<string | undefined>;
  /** Adopt a value from a locator that includes connection hints. */
  adoptFromLocator(
    locator: string,
    petNameOrPath: string | string[],
  ): Promise<void>;
  invite(guestName: string): Promise<Invitation>;
  accept(invitationLocator: string, guestName: string): Promise<void>;
  endow(
    messageNumber: bigint,
    bindings: Record<string, string | string[]>,
    workerName?: string,
    resultName?: string | string[],
  ): Promise<void>;
  submit(messageNumber: bigint, values: Record<string, unknown>): Promise<void>;
  sendValue: Mail['sendValue'];
  /** Returns a snapshot of the formula dependency graph reachable from this agent's pet store. */
  getFormulaGraph(): Promise<{
    nodes: Array<{ id: FormulaIdentifier; type: string }>;
    edges: Array<{
      sourceId: FormulaIdentifier;
      targetId: FormulaIdentifier;
      label: string;
    }>;
  }>;
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

export type EndoInspector<Record = string> = {
  lookup: (petNameOrPath: Record | NameOrPath) => Promise<unknown>;
  list: () => Record[];
};

export type KnownEndoInspectors = {
  eval: EndoInspector<'endowments' | 'source' | 'worker'>;
  'make-unconfined': EndoInspector<'host'>;
  'make-bundle': EndoInspector<'bundle' | 'powers' | 'worker'>;
  guest: EndoInspector<'bundle' | 'powers'>;
  // This is an "empty" inspector, in that there is nothing to `lookup()` or `list()`.
  [formulaType: string]: EndoInspector<any>;
};

export type EndoBootstrap = {
  ping: () => Promise<string>;
  terminate: () => Promise<void>;
  host: () => Promise<EndoHost>;
  leastAuthority: () => Promise<EndoGuest>;
  greeter: () => Promise<EndoGreeter>;
  gateway: () => Promise<EndoGateway>;
  sign: (hexBytes: string) => Promise<string>;
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
  readFileText: (path: string) => Promise<string>;
  maybeReadFileText: (path: string) => Promise<string | undefined>;
  readDirectory: (path: string) => Promise<Array<string>>;
  makePath: (path: string) => Promise<void>;
  joinPath: (...components: Array<string>) => string;
  removePath: (path: string) => Promise<void>;
  renamePath: (source: string, target: string) => Promise<void>;
  realPath: (path: string) => Promise<string>;
  isDirectory: (path: string) => Promise<boolean>;
  exists: (path: string) => Promise<boolean>;
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
  makeBundle(
    bundle: ERef<EndoReadable>,
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
};

export type DaemonicPowers = {
  crypto: CryptoPowers;
  petStore: PetStorePowers;
  persistence: DaemonicPersistencePowers;
  control: DaemonicControlPowers;
  filePowers: FilePowers;
};

type FormulateResult<T> = Promise<{
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
  execute(identifiers: Readonly<T>): Promise<void>;
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
  workerId: FormulaIdentifier;
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

  formulateBundle: (
    hostAgentId: FormulaIdentifier,
    hostHandleId: FormulaIdentifier,
    bundleId: FormulaIdentifier,
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
    readerRef: ERef<AsyncIterableIterator<string>>,
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
  ) => FormulateResult<unknown>;

  formulateScratchMount: (
    readOnly: boolean,
    deferredTasks: DeferredTasks<ScratchMountDeferredTaskParams>,
  ) => FormulateResult<unknown>;

  formulateInvitation: (
    hostAgentId: FormulaIdentifier,
    hostHandleId: FormulaIdentifier,
    guestName: PetName,
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
  provideController: (id: FormulaIdentifier) => Controller;
}

export interface DaemonCoreExternal {
  formulateEndo: DaemonCore['formulateEndo'];
  nodeNumber: NodeNumber;
  provide: DaemonCore['provide'];
  capTpConnectionRegistrar: CapTpConnectionRegistrar;
}

export type SerialJobs = {
  enqueue: <T>(asyncFn?: () => Promise<T>) => Promise<T>;
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
    remoteGateway: Promise<EndoGateway>,
    cancel: (error: Error) => void | Promise<void>,
    cancelled: Promise<never>,
    dispose?: () => void,
  ): void;
  connect(
    getRemoteGateway: () => Promise<EndoGateway>,
    cancel: (error: Error) => void | Promise<void>,
    cancelled: Promise<never>,
    dispose?: () => void,
  ): Promise<EndoGateway>;
  getStateName(): string;
}

export interface RemoteControlState {
  accept(
    remoteGateway: Promise<EndoGateway>,
    cancel: (error: Error) => void | Promise<void>,
    cancelled: Promise<never>,
    dispose: () => void,
  ): RemoteControlState;
  connect(
    getRemoteGateway: () => Promise<EndoGateway>,
    cancel: (error: Error) => void | Promise<void>,
    cancelled: Promise<never>,
    dispose: () => void,
  ): { state: RemoteControlState; remoteGateway: Promise<EndoGateway> };
}
