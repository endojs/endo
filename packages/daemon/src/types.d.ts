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
};

type EndoFormula = {
  type: 'endo';
  host: string;
  leastAuthority: string;
  webPageJs?: string;
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
    evalFormulaNumber: string;
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

export type Formula =
  | EndoFormula
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
  | PetStoreFormula;

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

export interface Topic<
  TRead,
  TWrite = undefined,
  TReadReturn = undefined,
  TWriteReturn = undefined,
> {
  publisher: Stream<TWrite, TRead, TWriteReturn, TReadReturn>;
  subscribe(): Stream<TRead, TWrite, TReadReturn, TWriteReturn>;
}

export interface Context {
  cancel: (reason?: unknown, logPrefix?: string) => Promise<void>;
  cancelled: Promise<never>;
  disposed: Promise<void>;
  thisDiesIfThatDies: (formulaIdentifier: string) => void;
  thatDiesIfThisDies: (formulaIdentifier: string) => void;
  onCancel: (hook: () => void | Promise<void>) => void;
}

export interface FarContext {
  cancel: (reason: Error) => Promise<void>;
  whenCancelled: () => Promise<never>;
  whenDisposed: () => Promise<void>;
}

export interface InternalExternal<External = unknown, Internal = unknown> {
  external: External;
  internal: Internal;
}

export interface Controller<External = unknown, Internal = unknown> {
  external: Promise<External>;
  internal: Promise<Internal>;
  context: Context;
}

export type ProvideValueForFormulaIdentifier = (
  formulaIdentifier: string,
) => Promise<unknown>;
export type ProvideControllerForFormulaIdentifier = (
  formulaIdentifier: string,
) => Controller;
export type ProvideControllerForFormulaIdentifierAndResolveHandle = (
  formulaIdentifier: string,
) => Promise<Controller>;

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

export type GetFormulaIdentifierForRef = (ref: unknown) => string | undefined;
export type MakeSha512 = () => Sha512;

export type ProvideValueForNumberedFormula = (
  formulaType: string,
  formulaNumber: string,
  formula: Formula,
) => Promise<{ formulaIdentifier: string; value: unknown }>;

export interface PetStore {
  has(petName: string): boolean;
  identifyLocal(petName: string): string | undefined;
  list(): Array<string>;
  follow(): Promise<
    FarRef<
      Reader<
        { add: string; value: FormulaIdentifierRecord } | { remove: string }
      >
    >
  >;
  listEntries(): Array<[string, FormulaIdentifierRecord]>;
  followEntries(): Promise<
    FarRef<
      Reader<
        { add: string; value: FormulaIdentifierRecord } | { remove: string }
      >
    >
  >;
  write(petName: string, formulaIdentifier: string): Promise<void>;
  remove(petName: string);
  rename(fromPetName: string, toPetName: string);
  /**
   * @param formulaIdentifier The formula identifier to look up.
   * @returns The formula identifier for the given pet name, or `undefined` if the pet name is not found.
   */
  reverseLookup(formulaIdentifier: string): Array<string>;
}

export interface Mail {
  // Partial inheritance from PetStore:
  has: PetStore['has'];
  rename: PetStore['rename'];
  remove: PetStore['remove'];
  list: PetStore['list'];
  identifyLocal: PetStore['identifyLocal'];
  reverseLookup: PetStore['reverseLookup'];
  // Extended methods:
  lookup(...petNamePath: string[]): Promise<unknown>;
  listSpecial(): Array<string>;
  listAll(): Array<string>;
  reverseLookupFormulaIdentifier(formulaIdentifier: string): Array<string>;
  cancel(petName: string, reason: unknown): Promise<void>;
  // Mail operations:
  listMessages(): Promise<Array<Message>>;
  followMessages(): Promise<FarRef<Reader<Message>>>;
  request(
    recipientName: string,
    what: string,
    responseName: string,
  ): Promise<unknown>;
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
  send(
    recipientName: string,
    strings: Array<string>,
    edgeNames: Array<string>,
    petNames: Array<string>,
  ): Promise<void>;
  resolve(messageNumber: number, resolutionName: string): Promise<void>;
  reject(messageNumber: number, message?: string): Promise<void>;
  dismiss(messageNumber: number): Promise<void>;
  adopt(
    messageNumber: number,
    edgeName: string,
    petName: string,
  ): Promise<void>;
}

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

export interface EndoGuest {
  request(what: string, responseName: string): Promise<unknown>;
}

export interface EndoHost {
  listMessages(): Promise<Array<Message>>;
  followMessages(): ERef<AsyncIterable<Message>>;
  lookup(...petNamePath: string[]): Promise<unknown>;
  resolve(requestNumber: number, petName: string);
  reject(requestNumber: number, message: string);
  reverseLookup(ref: object): Promise<Array<string>>;
  remove(petName: string);
  rename(fromPetName: string, toPetName: string);
  list(): Array<string>; // pet names
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
  makeWorker(petName: string): Promise<EndoWorker>;
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
}

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
  ) => Promise<FarRef<PetStore>>;
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
