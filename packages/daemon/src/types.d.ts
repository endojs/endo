import type { ERef } from '@endo/eventual-send';
import { FarRef } from '@endo/far';
import type { Reader, Writer, Stream } from '@endo/stream';

export type SomehowAsyncIterable<T> =
  | AsyncIterable<T>
  | Iterable<T>
  | { next: () => IteratorResult<T> };

export type Locator = {
  statePath: string;
  httpPort?: number;
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

type FormulaIdentifierRecord = {
  type: string;
  number: string;
  node: string;
};

type EndoFormula = {
  type: 'endo';
  networks: string;
  peers: string;
  host: string;
  leastAuthority: string;
  webPageJs?: string;
};

type LoopbackNetworkFormula = {
  type: 'loopback-network';
};

type WorkerFormula = {
  type: 'worker';
};

type HostFormula = {
  type: 'host';
  worker: string;
  inspector: string;
  petStore: string;
  endo: string;
  networks: string;
  leastAuthority: string;
};

type GuestFormula = {
  type: 'guest';
  host: string;
  petStore: string;
  worker: string;
};

type LeastAuthorityFormula = {
  type: 'least-authority';
};

type EvalFormula = {
  type: 'eval';
  worker: string;
  source: string;
  names: Array<string>; // lexical names
  values: Array<string>; // formula identifiers
  // TODO formula slots
};

export type EvalFormulaHook = (
  identifiers: Readonly<{
    endowmentFormulaIdentifiers: string[];
    evalFormulaIdentifier: string;
    workerFormulaIdentifier: string;
  }>,
) => Promise<unknown>;

type ReadableBlobFormula = {
  type: 'readable-blob';
  content: string;
};

type LookupFormula = {
  type: 'lookup';

  /**
   * The formula identifier of the naming hub to call lookup on.
   * A "naming hub" is an object with a variadic `lookup()` method.
   */
  hub: string;

  /**
   * The pet name path.
   */
  path: Array<string>;
};

type MakeUnconfinedFormula = {
  type: 'make-unconfined';
  worker: string;
  powers: string;
  specifier: string;
  // TODO formula slots
};

type MakeBundleFormula = {
  type: 'make-bundle';
  worker: string;
  powers: string;
  bundle: string;
  // TODO formula slots
};

type PeerFormula = {
  type: 'peer';
  node: string;
  addresses: Array<string>;
};

type WebBundleFormula = {
  type: 'web-bundle';
  bundle: string;
  powers: string;
};

type HandleFormula = {
  type: 'handle';
  target: string;
};

type PetStoreFormula = {
  type: 'pet-store';
};

type PetInspectorFormula = {
  type: 'pet-inspector';
  petStore: string;
};

type DirectoryFormula = {
  type: 'directory';
  petStore: string;
};

export type Formula =
  | EndoFormula
  | LoopbackNetworkFormula
  | WorkerFormula
  | HostFormula
  | GuestFormula
  | LeastAuthorityFormula
  | EvalFormula
  | ReadableBlobFormula
  | LookupFormula
  | MakeUnconfinedFormula
  | MakeBundleFormula
  | WebBundleFormula
  | HandleFormula
  | PetInspectorFormula
  | PetStoreFormula
  | DirectoryFormula
  | PeerFormula;

export type Label = {
  number: number;
  who: string;
  dest: string;
  when: string;
  dismissed: Promise<void>;
};
export type InternalLabel = Label;

export type Request = {
  type: 'request';
  what: string;
  settled: Promise<'fulfilled' | 'rejected'>;
};
export type InternalRequest = Request;

export type Package = {
  type: 'package';
  strings: Array<string>; // text that appears before, between, and after named formulas.
  names: Array<string>; // edge names
  formulas: Array<string>; // formula identifiers
};
export type InternalPackage = Package;

export type Payload = Request | Package;
export type InternalPayload = InternalRequest | InternalPackage;

export type Message = Label & Payload;
export type InternalMessage = InternalLabel & InternalPayload;

export type Invitation = {
  powers: string;
  addresses: Array<string>;
};

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
   * @param formulaIdentifier - The formula identifier of the value whose
   * cancellation should cause this value to be cancelled.
   */
  thisDiesIfThatDies: (formulaIdentifier: string) => void;

  /**
   * @param formulaIdentifier - The formula identifier of the value that should
   * be cancelled if this value is cancelled.
   */
  thatDiesIfThisDies: (formulaIdentifier: string) => void;

  /**
   * @param hook - A hook to run when the value is cancelled.
   */
  onCancel: (hook: () => void | Promise<void>) => void;
}

export interface FarContext {
  cancel: (reason: Error) => Promise<void>;
  whenCancelled: () => Promise<never>;
  whenDisposed: () => Promise<void>;
  addDisposalHook: Context['onCancel'];
}

export interface InternalExternal<External = unknown, Internal = unknown> {
  external: External;
  internal: Internal;
}

export interface ControllerPartial<External = unknown, Internal = unknown> {
  external: Promise<External>;
  internal: Promise<Internal>;
}

export interface Controller<External = unknown, Internal = unknown>
  extends ControllerPartial<External, Internal> {
  context: Context;
}

/**
 * A handle is used to create a pointer to a formula without exposing it directly.
 * This is the external facet of the handle and is safe to expose. This is used to
 * provide an EndoGuest with a reference to its creator EndoHost. By using a handle
 * that points to the host instead of giving a direct reference to the host, the
 * guest does not get access to the functions of the host. This is the external
 * facet of a handle. It directly exposes nothing. The handle's target is only
 * exposed on the internal facet.
 */
export interface ExternalHandle {}
/**
 * This is the internal facet of a handle. It exposes the formula id that the
 * handle points to. This should not be exposed outside of the endo daemon.
 */
export interface InternalHandle {
  targetFormulaIdentifier: string;
}

export type MakeSha512 = () => Sha512;

export type PetStoreNameDiff =
  | { add: string; value: FormulaIdentifierRecord }
  | { remove: string };

export interface PetStore {
  has(petName: string): boolean;
  identifyLocal(petName: string): string | undefined;
  list(): Array<string>;
  follow(): AsyncGenerator<PetStoreNameDiff, undefined, undefined>;
  write(petName: string, formulaIdentifier: string): Promise<void>;
  remove(petName: string): Promise<void>;
  rename(fromPetName: string, toPetName: string): Promise<void>;
  /**
   * @param formulaIdentifier The formula identifier to look up.
   * @returns The formula identifier for the given pet name, or `undefined` if the pet name is not found.
   */
  reverseIdentify(formulaIdentifier: string): Array<string>;
}

export interface PeerInfo {
  node: string;
  addresses: string[];
}

export interface LocateRecord {
  peerInfo: PeerInfo;
  formulaIdentifier: string;
}

export interface NameHub {
  has(...petNamePath: string[]): Promise<boolean>;
  identify(...petNamePath: string[]): Promise<string | undefined>;
  locate(...petNamePath: string[]): Promise<LocateRecord>;
  list(...petNamePath: string[]): Promise<Array<string>>;
  listIdentifiers(...petNamePath: string[]): Promise<Array<string>>;
  followChanges(
    ...petNamePath: string[]
  ): AsyncGenerator<PetStoreNameDiff, undefined, undefined>;
  lookup(...petNamePath: string[]): Promise<unknown>;
  reverseLookup(value: unknown): Array<string>;
  write(petNamePath: string[], formulaIdentifier): Promise<void>;
  remove(...petNamePath: string[]): Promise<void>;
  move(fromPetName: string[], toPetName: string[]): Promise<void>;
  copy(fromPetName: string[], toPetName: string[]): Promise<void>;
}

export interface EndoDirectory extends NameHub {
  makeDirectory(petName: string): Promise<EndoDirectory>;
}

export type MakeDirectoryNode = (petStore: PetStore) => EndoDirectory;

export interface Mail {
  // Partial inheritance from PetStore:
  petStore: PetStore;
  // Mail operations:
  listMessages(): Promise<Array<Message>>;
  followMessages(): AsyncGenerator<Message, undefined, undefined>;
  resolve(messageNumber: number, resolutionName: string): Promise<void>;
  reject(messageNumber: number, message?: string): Promise<void>;
  adopt(
    messageNumber: number,
    edgeName: string,
    petName: string,
  ): Promise<void>;
  dismiss(messageNumber: number): Promise<void>;
  request(
    recipientName: string,
    what: string,
    responseName: string,
  ): Promise<unknown>;
  send(
    recipientName: string,
    strings: Array<string>,
    edgeNames: Array<string>,
    petNames: Array<string>,
  ): Promise<void>;
  respond(
    what: string,
    responseName: string,
    senderFormulaIdentifier: string,
    senderPetStore: PetStore,
    recipientFormulaIdentifier?: string,
  ): Promise<unknown>;
  receive(
    senderFormulaIdentifier: string,
    strings: Array<string>,
    edgeNames: Array<string>,
    formulaIdentifiers: Array<string>,
    receiverFormulaIdentifier: string,
  ): void;
}

export type MakeMailbox = (args: {
  selfFormulaIdentifier: string;
  petStore: PetStore;
  context: Context;
}) => Mail;

export type RequestFn = (
  what: string,
  responseName: string,
  guestFormulaIdentifier: string,
  guestPetStore: PetStore,
) => Promise<unknown>;

export type ReceiveFn = (
  senderFormulaIdentifier: string,
  strings: Array<string>,
  edgeNames: Array<string>,
  formulaIdentifiers: Array<string>,
) => void;

export interface EndoReadable {
  sha512(): string;
  streamBase64(): FarRef<Reader<string>>;
  text(): Promise<string>;
  json(): Promise<unknown>;
}
export type FarEndoReadable = FarRef<EndoReadable>;

export interface EndoWorker {
  terminate(): void;
  whenTerminated(): Promise<void>;
}

export type MakeHostOrGuestOptions = {
  introducedNames?: Record<string, string>;
};

export interface EndoPeer {
  provide: (formulaIdentifier: string) => Promise<unknown>;
  getPeerInfo(): Promise<PeerInfo>;
}
export type EndoPeerControllerPartial = ControllerPartial<EndoPeer, undefined>;
export type EndoPeerController = Controller<EndoPeer, undefined>;

export interface EndoGateway {
  provide: (formulaIdentifier: string) => Promise<unknown>;
}

export interface EndoNetwork {
  supports: (network: string) => boolean;
  addresses: () => Array<string>;
  connect: (address: string, farContext: FarContext) => EndoGateway;
}

export interface EndoGuest extends EndoDirectory {
  listMessages: Mail['listMessages'];
  followMessages: Mail['followMessages'];
  resolve: Mail['resolve'];
  reject: Mail['reject'];
  adopt: Mail['adopt'];
  dismiss: Mail['dismiss'];
  request: Mail['request'];
  send: Mail['send'];
}
export type FarEndoGuest = FarRef<EndoGuest>;

export interface EndoHost extends EndoDirectory {
  listMessages: Mail['listMessages'];
  followMessages: Mail['followMessages'];
  resolve: Mail['resolve'];
  reject: Mail['reject'];
  adopt: Mail['adopt'];
  dismiss: Mail['dismiss'];
  request: Mail['request'];
  send: Mail['send'];
  store(
    readerRef: ERef<AsyncIterableIterator<string>>,
    petName: string,
  ): Promise<void>;
  provideGuest(
    petName?: string,
    opts?: MakeHostOrGuestOptions,
  ): Promise<EndoGuest>;
  provideHost(
    petName?: string,
    opts?: MakeHostOrGuestOptions,
  ): Promise<EndoHost>;
  makeDirectory(petName: string): Promise<EndoDirectory>;
  makeWorker(petName: string): Promise<EndoWorker>;
  provideWorker(petName: string): Promise<EndoWorker>;
  evaluate(
    workerPetName: string | undefined,
    source: string,
    codeNames: Array<string>,
    petNames: Array<string>,
    resultName?: string,
  );
  makeUnconfined(
    workerName: string | 'NEW' | 'MAIN',
    specifier: string,
    powersName: string | 'NONE' | 'SELF' | 'ENDO',
    resultName?: string,
  ): Promise<unknown>;
  makeBundle(
    workerPetName: string | undefined,
    bundleName: string,
    powersName: string,
    resultName?: string,
  ): Promise<unknown>;
  provideWebPage(
    webPageName: string,
    bundleName: string,
    powersName: string,
  ): Promise<unknown>;
  cancel(petName: string, reason: Error): Promise<void>;
  gateway(): Promise<EndoGateway>;
  getPeerInfo(): Promise<PeerInfo>;
  addPeerInfo(peerInfo: PeerInfo): Promise<void>;
}

export interface InternalEndoHost {
  receive: Mail['receive'];
  respond: Mail['respond'];
  petStore: PetStore;
}

export interface EndoHostController
  extends Controller<FarRef<EndoHost>, InternalEndoHost> {}

export type EndoInspector<Record = string> = {
  lookup: (petName: Record) => Promise<unknown>;
  list: () => Record[];
};

export type KnownEndoInspectors = {
  eval: EndoInspector<'endowments' | 'source' | 'worker'>;
  'make-unconfined': EndoInspector<'host'>;
  'make-bundle': EndoInspector<'bundle' | 'powers' | 'worker'>;
  guest: EndoInspector<'bundle' | 'powers'>;
  'web-bundle': EndoInspector<'powers' | 'specifier' | 'worker'>;
  // This is an "empty" inspector, in that there is nothing to `lookup()` or `list()`.
  [formulaType: string]: EndoInspector<string>;
};

export type EndoWebBundle = {
  url: string;
  bundle: ERef<EndoReadable>;
  powers: ERef<unknown>;
};

export type FarEndoBootstrap = FarRef<{
  ping: () => Promise<string>;
  terminate: () => Promise<void>;
  host: () => Promise<EndoHost>;
  leastAuthority: () => Promise<EndoGuest>;
  webPageJs: () => Promise<unknown>;
  importAndEndowInWebPage: () => Promise<void>;
  gateway: () => Promise<EndoGateway>;
  reviveNetworks: () => Promise<void>;
  addPeerInfo: (peerInfo: PeerInfo) => Promise<void>;
}>;

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
  servePortHttp: (args: {
    port: number;
    host?: string;
    respond?: HttpRespond;
    connect?: HttpConnect;
    cancelled: Promise<never>;
  }) => Promise<number>;
  makePrivatePathService: (
    endoBootstrap: FarEndoBootstrap,
    sockPath: string,
    cancelled: Promise<never>,
    exitWithError: (error: Error) => void,
  ) => { started: Promise<void>; stopped: Promise<void> };
  makePrivateHttpService: (
    endoBootstrap: FarEndoBootstrap,
    port: number,
    assignWebletPort: (portP: Promise<number>) => void,
    cancelled: Promise<never>,
    exitWithError: (error: Error) => void,
  ) => { started: Promise<void>; stopped: Promise<void> };
};

export type DaemonicPersistencePowers = {
  initializePersistence: () => Promise<void>;
  provideRootNonce: () => Promise<{
    rootNonce: string;
    isNewlyCreated: boolean;
  }>;
  makeContentSha512Store: () => {
    store: (readable: AsyncIterable<Uint8Array>) => Promise<string>;
    fetch: (sha512: string) => EndoReadable;
  };
  readFormula: (prefix: string, formulaNumber: string) => Promise<Formula>;
  writeFormula: (
    formula: Formula,
    formulaType: string,
    formulaNumber: string,
  ) => Promise<void>;
  getWebPageBundlerFormula?: (
    workerFormulaIdentifier: string,
    powersFormulaIdentifier: string,
  ) => MakeUnconfinedFormula;
};

export interface DaemonWorkerFacet {}

export interface WorkerDaemonFacet {
  terminate(): void;
  evaluate(
    source: string,
    names: Array<string>,
    values: Array<unknown>,
    cancelled: Promise<never>,
  ): Promise<unknown>;
  makeBundle(bundle: ERef<EndoReadable>, powers: ERef<unknown>);
  makeUnconfined(path: string, powers: ERef<unknown>);
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

export interface PeerStore {
  get(nodeId: string): string | undefined;
  set(nodeId: string, peerFormulaIdentifier: string): void;
}

type IncarnateResult<T> = Promise<{ formulaIdentifier: string; value: T }>;
export interface DaemonCore {
  nodeIdentifier: string;
  provideValueForFormulaIdentifier: (
    formulaIdentifier: string,
  ) => Promise<unknown>;
  provideControllerForFormulaIdentifier: (
    formulaIdentifier: string,
  ) => Controller;
  provideControllerForFormulaIdentifierAndResolveHandle: (
    formulaIdentifier: string,
  ) => Promise<Controller>;
  provideValueForNumberedFormula: (
    formulaType: string,
    formulaNumber: string,
    formula: Formula,
  ) => Promise<{ formulaIdentifier: string; value: unknown }>;
  getFormulaIdentifierForRef: (ref: unknown) => string | undefined;
  getAllNetworkAddresses: () => Promise<string[]>;
  /**
   * This is an interface on top of the petstore that translates the nodeId
   * into a valid petstore name.
   */
  getPeerStore: () => Promise<PeerStore>;
  getPeerInfoForNodeIdentifier: (nodeId: string) => Promise<PeerInfo>;
  addPeerInfo: (peerInfo: PeerInfo) => Promise<void>;
  getOwnPeerInfo: () => Promise<PeerInfo>;
  incarnateEndoBootstrap: (
    specifiedFormulaNumber: string,
  ) => IncarnateResult<FarEndoBootstrap>;
  incarnateWorker: () => IncarnateResult<EndoWorker>;
  incarnatePetStore: (
    specifiedFormulaNumber?: string,
  ) => IncarnateResult<PetStore>;
  incarnateDirectory: (
    specifiedFormulaNumber?: string,
  ) => IncarnateResult<EndoDirectory>;
  incarnatePetInspector: (
    petStoreFormulaIdentifier: string,
  ) => IncarnateResult<EndoInspector>;
  incarnateHost: (
    endoFormulaIdentifier: string,
    leastAuthorityFormulaIdentifier: string,
    specifiedWorkerFormulaIdentifier?: string | undefined,
  ) => IncarnateResult<EndoHost>;
  incarnateGuest: (
    hostHandleFormulaIdenfitier: string,
  ) => IncarnateResult<EndoGuest>;
  incarnateReadableBlob: (
    contentSha512: string,
  ) => IncarnateResult<FarEndoReadable>;
  incarnateEval: (
    hostFormulaIdentifier: string,
    source: string,
    codeNames: string[],
    endowmentFormulaIdsOrPaths: (string | string[])[],
    hooks: EvalFormulaHook[],
    specifiedWorkerFormulaIdentifier?: string,
  ) => IncarnateResult<unknown>;
  incarnateUnconfined: (
    workerFormulaIdentifier: string,
    powersFormulaIdentifier: string,
    specifier: string,
  ) => IncarnateResult<unknown>;
  incarnateBundler: (
    powersFormulaIdentifier: string,
    workerFormulaIdentifier: string,
  ) => IncarnateResult<unknown>;
  incarnateBundle: (
    powersFormulaIdentifier: string,
    workerFormulaIdentifier: string,
    bundleFormulaIdentifier: string,
  ) => IncarnateResult<unknown>;
  incarnateWebBundle: (
    powersFormulaIdentifier: string,
    bundleFormulaIdentifier: string,
  ) => IncarnateResult<unknown>;
  incarnateHandle: (
    targetFormulaIdentifier: string,
  ) => IncarnateResult<ExternalHandle>;
  incarnatePeer: (
    nodeId: string,
    addresses: Array<string>,
  ) => IncarnateResult<EndoPeer>;
  incarnateNetworksDirectory: () => IncarnateResult<EndoDirectory>;
  incarnateLoopbackNetwork: () => IncarnateResult<EndoNetwork>;
  incarnateLeastAuthority: () => IncarnateResult<EndoGuest>;
  cancelValue: (formulaIdentifier: string, reason: Error) => Promise<void>;
  storeReaderRef: (
    readerRef: ERef<AsyncIterableIterator<string>>,
  ) => Promise<string>;
  makeMailbox: MakeMailbox;
  makeDirectoryNode: MakeDirectoryNode;
}

export type Mutex = {
  lock: () => Promise<void>;
  unlock: () => void;
  enqueue: <T>(asyncFn?: () => Promise<T>) => Promise<T>;
};

/**
 * A multimap backed by a WeakMap. Keys must be objects.
 */
export type WeakMultimap<K extends WeakKey, V> = {
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
  getAll(key: K): V[];
};
