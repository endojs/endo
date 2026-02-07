import type { Passable } from '@endo/pass-style';
import type { ERef } from '@endo/eventual-send';
import type { FarRef } from '@endo/far';
import type { Reader, Writer, Stream } from '@endo/stream';

// Branded string types for pet names and special names
declare const PetNameBrand: unique symbol;
declare const SpecialNameBrand: unique symbol;
declare const EdgeNameBrand: unique symbol;
declare const FormulaNumberBrand: unique symbol;
declare const NodeNumberBrand: unique symbol;
declare const FormulaIdentifierBrand: unique symbol;

/** A validated pet name (lowercase, e.g., 'worker', 'my-app') */
export type PetName = string & { [PetNameBrand]: true };

/** A validated special name (uppercase, e.g., 'SELF', 'HOST', 'ENDO') */
export type SpecialName = string & { [SpecialNameBrand]: true };

/** A validated edge name for message edges (pet names or special names) */
export type EdgeName = string & { [EdgeNameBrand]: true };

/** A 128-character hex string identifying a formula within a node */
export type FormulaNumber = string & { [FormulaNumberBrand]: true };

/** A 128-character hex string identifying a node */
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

export type Sha512 = {
  update: (chunk: Uint8Array) => void;
  updateText: (chunk: string) => void;
  digestHex: () => string;
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

type HostFormula = {
  type: 'host';
  handle: FormulaIdentifier;
  worker: FormulaIdentifier;
  inspector: FormulaIdentifier;
  petStore: FormulaIdentifier;
  mailboxStore: FormulaIdentifier;
  mailHub: FormulaIdentifier;
  endo: FormulaIdentifier;
  networks: FormulaIdentifier;
  pins: FormulaIdentifier;
};

type GuestFormula = {
  type: 'guest';
  handle: FormulaIdentifier;
  hostHandle: FormulaIdentifier;
  hostAgent: FormulaIdentifier;
  petStore: FormulaIdentifier;
  mailboxStore: FormulaIdentifier;
  mailHub: FormulaIdentifier;
  worker: FormulaIdentifier;
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
  names: Array<Name>; // lexical names
  values: Array<string>; // formula identifiers
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
  // TODO formula slots
};

type MakeBundleFormula = {
  type: 'make-bundle';
  worker: FormulaIdentifier;
  powers: FormulaIdentifier;
  bundle: FormulaIdentifier;
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
  messageType: 'request' | 'package';
  from: FormulaIdentifier;
  to: FormulaIdentifier;
  date: string;
  description?: string;
  promiseId?: FormulaIdentifier;
  resolverId?: FormulaIdentifier;
  strings?: string[];
  names?: string[];
  ids?: FormulaIdentifier[];
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

type InvitationFormula = {
  type: 'invitation';
  hostAgent: string; // identifier
  hostHandle: string; // identifier
  guestName: PetName;
};

export type InvitationDeferredTaskParams = {
  invitationId: FormulaIdentifier;
};

export type Formula =
  | EndoFormula
  | LoopbackNetworkFormula
  | WorkerFormula
  | HostFormula
  | GuestFormula
  | LeastAuthorityFormula
  | MarshalFormula
  | EvalFormula
  | ReadableBlobFormula
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
  | InvitationFormula;

export type Builtins = {
  NONE: FormulaIdentifier;
  MAIN: FormulaIdentifier;
};

export type Specials = {
  [specialName: string]: (builtins: Builtins) => Formula;
};

export interface Responder {
  resolveWithId(id: string | Promise<string>): void;
}

export type Request = {
  type: 'request';
  description: string;
  promiseId: FormulaIdentifier;
  resolverId: FormulaIdentifier;
  settled: Promise<'fulfilled' | 'rejected'>;
};

export type Package = {
  type: 'package';
  strings: Array<string>; // text that appears before, between, and after named formulas.
  names: Array<Name>; // edge names
  ids: Array<FormulaIdentifier>; // formula identifiers
};

export type EvalRequest = {
  type: 'eval-request';
  source: string;
  codeNames: Array<string>;
  petNamePaths: Array<NamePath>;
  responder: ERef<Responder>;
  settled: Promise<'fulfilled' | 'rejected'>;
};

export type Message = Request | Package | EvalRequest;

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
  accept(guestHandleLocator: string): Promise<void>;
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

export type MakeSha512 = () => Sha512;

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
  write(petName: PetName, id: string): Promise<void>;
  remove(petName: PetName): Promise<void>;
  rename(fromPetName: PetName, toPetName: PetName): Promise<void>;
  /**
   * @param id The formula identifier to look up.
   * @returns The formula identifier for the given pet name, or `undefined` if the pet name is not found.
   */
  reverseIdentify(id: string): Array<Name>;
}

export type KnownPeersStore = Omit<
  PetStore,
  'has' | 'identifyLocal' | 'write'
> & {
  has(nodeNumber: NodeNumber): boolean;
  identifyLocal(nodeNumber: NodeNumber): string | undefined;
  write(nodeNumber: NodeNumber, id: string): Promise<void>;
};

/**
 * `add` and `remove` are locators.
 */
export type LocatorNameChange =
  | { add: string; names: Name[] }
  | { remove: string; names?: Name[] };

export interface NameHub {
  has(...petNamePath: Name[]): Promise<boolean>;
  identify(...petNamePath: Name[]): Promise<string | undefined>;
  locate(...petNamePath: Name[]): Promise<string | undefined>;
  reverseLocate(locator: string): Promise<Name[]>;
  followLocatorNameChanges(
    locator: string,
  ): AsyncGenerator<LocatorNameChange, undefined, undefined>;
  list(...petNamePath: Name[]): Promise<Array<Name>>;
  listIdentifiers(...petNamePath: Name[]): Promise<Array<string>>;
  followNameChanges(
    ...petNamePath: Name[]
  ): AsyncGenerator<PetStoreNameChange, undefined, undefined>;
  lookup(petNamePath: NameOrPath): Promise<unknown>;
  reverseLookup(value: unknown): Array<Name>;
  write(petNamePath: NameOrPath, id: string): Promise<void>;
  remove(...petNamePath: Name[]): Promise<void>;
  move(fromPetName: NamePath, toPetName: NamePath): Promise<void>;
  copy(fromPetName: NamePath, toPetName: NamePath): Promise<void>;
}

export interface EndoDirectory extends NameHub {
  makeDirectory(petNamePath: NamePath): Promise<EndoDirectory>;
}

export type MakeDirectoryNode = (petStore: PetStore) => EndoDirectory;

export interface Mail {
  handle: () => Handle;
  // Partial inheritance from PetStore:
  petStore: PetStore;
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
  request(
    recipientName: NameOrPath,
    what: string,
    responseName?: NameOrPath,
  ): Promise<unknown>;
  send(
    recipientName: NameOrPath,
    strings: Array<string>,
    edgeNames: Array<EdgeName>,
    petNames: NamesOrPaths,
  ): Promise<void>;
  requestEvaluation(
    recipientName: NameOrPath,
    source: string,
    codeNames: Array<string>,
    petNamePaths: NamesOrPaths,
    responseName?: NameOrPath,
  ): Promise<unknown>;
  getEvalRequest(messageNumber: number): {
    source: string;
    codeNames: Array<string>;
    petNamePaths: Array<NamePath>;
    responder: ERef<Responder>;
    guestHandleId: string;
  };
  deliver(message: EnvelopedMessage): Promise<void>;
}

export type MakeMailbox = (args: {
  selfId: FormulaIdentifier;
  petStore: PetStore;
  mailboxStore: PetStore;
  directory: EndoDirectory;
  context: Context;
}) => Promise<Mail>;

export type RequestFn = (
  what: string,
  responseName: string,
  guestId: string,
  guestPetStore: PetStore,
) => Promise<unknown>;

export interface EndoReadable {
  sha512(): string;
  streamBase64(): FarRef<Reader<string>>;
  text(): Promise<string>;
  json(): Promise<unknown>;
}
export interface EndoWorker {}

export type MakeHostOrGuestOptions = {
  agentName?: string;
  introducedNames?: Record<string, string>;
};

export interface EndoPeer {
  provide: (id: string) => Promise<unknown>;
}

export interface EndoGateway {
  provide: (id: string) => Promise<unknown>;
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
  request: Mail['request'];
  send: Mail['send'];
  deliver: Mail['deliver'];
  /**
   * @param id The formula identifier to look up.
   * @returns The pet names for the given formula identifier.
   */
  reverseIdentify(id: string): Array<Name>;
}

export interface EndoGuest extends EndoAgent {
  requestEvaluation(
    source: string,
    codeNames: Array<string>,
    petNamePaths: NamesOrPaths,
    resultName?: NameOrPath,
  ): Promise<unknown>;
}

export type FarEndoGuest = FarRef<EndoGuest>;

export interface EndoHost extends EndoAgent {
  storeBlob(
    readerRef: ERef<AsyncIterableIterator<string>>,
    petName: NameOrPath,
  ): Promise<FarRef<EndoReadable>>;
  storeValue<T extends Passable>(value: T, petName: NameOrPath): Promise<void>;
  provideGuest(
    petName?: PetName,
    opts?: MakeHostOrGuestOptions,
  ): Promise<EndoGuest>;
  provideHost(
    petName?: PetName,
    opts?: MakeHostOrGuestOptions,
  ): Promise<EndoHost>;
  makeDirectory(petNamePath: NameOrPath): Promise<EndoDirectory>;
  provideWorker(petNamePath: NameOrPath): Promise<EndoWorker>;
  evaluate(
    workerPetName: Name | undefined,
    source: string,
    codeNames: Array<string>,
    petNames: NamesOrPaths,
    resultName?: NameOrPath,
  ): Promise<unknown>;
  makeUnconfined(
    workerName: Name | undefined,
    specifier: string,
    powersName: Name,
    resultName?: NameOrPath,
  ): Promise<unknown>;
  makeBundle(
    workerPetName: Name | undefined,
    bundleName: Name,
    powersName: Name,
    resultName?: NameOrPath,
  ): Promise<unknown>;
  cancel(petName: NameOrPath, reason?: Error): Promise<void>;
  greeter(): Promise<EndoGreeter>;
  gateway(): Promise<EndoGateway>;
  getPeerInfo(): Promise<PeerInfo>;
  addPeerInfo(peerInfo: PeerInfo): Promise<void>;
  invite(guestName: PetName): Promise<Invitation>;
  accept(invitationLocator: string, guestName: PetName): Promise<void>;
  approveEvaluation(
    messageNumber: number,
    workerName?: Name,
  ): Promise<void>;
}

export interface EndoHostController extends Controller<FarRef<EndoHost>> {}

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
  [formulaType: string]: EndoInspector<string>;
};

export type EndoBootstrap = {
  ping: () => Promise<string>;
  terminate: () => Promise<void>;
  host: () => Promise<EndoHost>;
  leastAuthority: () => Promise<EndoGuest>;
  greeter: () => Promise<EndoGreeter>;
  gateway: () => Promise<EndoGateway>;
  reviveNetworks: () => Promise<void>;
  revivePins: () => Promise<void>;
  addPeerInfo: (peerInfo: PeerInfo) => Promise<void>;
};

export type CryptoPowers = {
  makeSha512: () => Sha512;
  randomHex512: () => Promise<string>;
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
};

export type AssertValidNameFn = (name: string) => void;

export type PetStorePowers = {
  makeIdentifiedPetStore: (
    id: string,
    formulaType: 'pet-store' | 'known-peers-store' | 'mailbox-store',
    assertValidName: AssertValidNameFn,
  ) => Promise<PetStore>;
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

export type NetworkPowers = SocketPowers & {
  makePrivatePathService: (
    endoBootstrap: FarRef<EndoBootstrap>,
    sockPath: string,
    cancelled: Promise<never>,
    exitWithError: (error: Error) => void,
  ) => { started: Promise<void>; stopped: Promise<void> };
};

export type RootNonceDescriptor = {
  rootNonce: FormulaNumber;
  isNewlyCreated: boolean;
};

export type DaemonicPersistencePowers = {
  initializePersistence: () => Promise<void>;
  provideRootNonce: () => Promise<RootNonceDescriptor>;
  makeContentSha512Store: () => {
    store: (readable: AsyncIterable<Uint8Array>) => Promise<string>;
    fetch: (sha512: string) => EndoReadable;
  };
  readFormula: (formulaNumber: FormulaNumber) => Promise<Formula>;
  writeFormula: (
    formulaNumber: FormulaNumber,
    formula: Formula,
  ) => Promise<void>;
};

export interface DaemonWorkerFacet {}

export interface WorkerDaemonFacet {
  terminate(): Promise<void>;
  evaluate(
    source: string,
    names: Array<Name>,
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
  ) => Promise<{
    workerTerminated: Promise<void>;
    workerDaemonFacet: ERef<WorkerDaemonFacet>;
  }>;
};

export type DaemonicPowers = {
  crypto: CryptoPowers;
  petStore: PetStorePowers;
  persistence: DaemonicPersistencePowers;
  control: DaemonicControlPowers;
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
  guestId: FormulaIdentifier;
  hostAgentId: FormulaIdentifier;
  hostHandleId: FormulaIdentifier;
  storeId: FormulaIdentifier;
  mailboxStoreId: FormulaIdentifier;
  mailHubId: FormulaIdentifier;
  workerId: FormulaIdentifier;
};

type FormulateHostDependenciesParams = {
  endoId: FormulaIdentifier;
  networksDirectoryId: FormulaIdentifier;
  pinsDirectoryId: FormulaIdentifier;
  specifiedWorkerId?: FormulaIdentifier;
};

type FormulateNumberedHostParams = {
  hostFormulaNumber: FormulaNumber;
  hostId: FormulaIdentifier;
  handleId: FormulaIdentifier;
  workerId: FormulaIdentifier;
  storeId: FormulaIdentifier;
  mailboxStoreId: FormulaIdentifier;
  mailHubId: FormulaIdentifier;
  inspectorId: FormulaIdentifier;
  endoId: FormulaIdentifier;
  networksDirectoryId: FormulaIdentifier;
  pinsDirectoryId: FormulaIdentifier;
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
  ) => FormulateResult<unknown>;

  formulateDirectory: () => FormulateResult<EndoDirectory>;

  formulateEndo: (
    specifiedFormulaNumber?: FormulaNumber,
  ) => FormulateResult<FarRef<EndoBootstrap>>;

  formulateMarshalValue: (
    value: Passable,
    deferredTasks: DeferredTasks<MarshalDeferredTaskParams>,
  ) => FormulateResult<void>;

  formulatePromise: () => Promise<{
    promiseId: FormulaIdentifier;
    resolverId: FormulaIdentifier;
  }>;

  formulateMessage: (
    messageFormula: MessageFormula,
  ) => FormulateResult<NameHub>;

  formulateEval: (
    nameHubId: FormulaIdentifier,
    source: string,
    codeNames: Array<Name>,
    endowmentIdsOrPaths: (string | string[])[],
    deferredTasks: DeferredTasks<EvalDeferredTaskParams>,
    specifiedWorkerId?: FormulaIdentifier,
  ) => FormulateResult<unknown>;

  formulateGuest: (
    hostId: FormulaIdentifier,
    hostHandleId: FormulaIdentifier,
    deferredTasks: DeferredTasks<AgentDeferredTaskParams>,
  ) => FormulateResult<EndoGuest>;

  /**
   * Helper for callers of {@link formulateNumberedGuest}.
   * @param hostId - The formula identifier of the host to formulate a guest for.
   * @returns The formula identifiers for the guest formulation's dependencies.
   */
  formulateGuestDependencies: (
    hostAgentId: FormulaIdentifier,
    hostHandleId: FormulaIdentifier,
  ) => Promise<Readonly<FormulateNumberedGuestParams>>;

  formulateHost: (
    endoId: FormulaIdentifier,
    networksDirectoryId: FormulaIdentifier,
    pinsDirectoryId: FormulaIdentifier,
    deferredTasks: DeferredTasks<AgentDeferredTaskParams>,
    specifiedWorkerId?: FormulaIdentifier | undefined,
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
    networksId: string,
    nodeNumber: NodeNumber,
    addresses: Array<string>,
  ) => FormulateResult<EndoPeer>;

  formulateReadableBlob: (
    readerRef: ERef<AsyncIterableIterator<string>>,
    deferredTasks: DeferredTasks<ReadableBlobDeferredTaskParams>,
  ) => FormulateResult<FarRef<EndoReadable>>;

  formulateInvitation: (
    hostAgentId: string,
    hostHandleId: string,
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
  ) => FormulateResult<unknown>;

  formulateWorker: (
    deferredTasks: DeferredTasks<WorkerDeferredTaskParams>,
  ) => FormulateResult<EndoWorker>;

  getAllNetworkAddresses: (
    networksDirectoryId: FormulaIdentifier,
  ) => Promise<string[]>;

  getIdForRef: (ref: unknown) => FormulaIdentifier | undefined;

  getTypeForId: (id: FormulaIdentifier) => Promise<string>;

  makeDirectoryNode: MakeDirectoryNode;

  makeMailbox: MakeMailbox;

  provide: Provide;

  provideController: (id: FormulaIdentifier) => Controller;

  provideAgentForHandle: (id: string) => Promise<ERef<EndoAgent>>;

  getAgentIdForHandleId: (handleId: FormulaIdentifier) => Promise<FormulaIdentifier>;
}

export interface DaemonCoreExternal {
  formulateEndo: DaemonCore['formulateEndo'];
  nodeNumber: NodeNumber;
  provide: DaemonCore['provide'];
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
