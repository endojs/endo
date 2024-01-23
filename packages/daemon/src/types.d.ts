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
  pathToFileURL: (path: string) => string;
  connection: {
    reader: Reader<Uint8Array>;
    writer: Writer<Uint8Array>;
  };
};

type FormulaIdentifierRecord = {
  type: string;
  number: string;
};

type GuestFormula = {
  type: 'guest';
  host: string;
};

type EvalFormula = {
  type: 'eval';
  worker: string;
  source: string;
  names: Array<string>; // lexical names
  values: Array<string>; // formula identifiers
  // TODO formula slots
};

type ImportUnsafeFormula = {
  type: 'import-unsafe';
  worker: string;
  powers: string;
  importPath: string;
  // TODO formula slots
};

type ImportBundleFormula = {
  type: 'import-bundle';
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

export type Formula =
  | GuestFormula
  | EvalFormula
  | ImportUnsafeFormula
  | ImportBundleFormula
  | WebBundleFormula;

export type Label = {
  number: number;
  who: string;
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
};
export type InternalPackage = Package & {
  formulas: Array<string>; // formula identifiers
};

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

export interface Terminator {
  terminate: (logPrefix?: string) => Promise<void>;
  terminated: Promise<void>;
  thisDiesIfThatDies: (formulaIdentifier: string) => void;
  thatDiesIfThisDies: (formulaIdentifier: string) => void;
  onTerminate: (hook: () => void | Promise<void>) => void;
}

export interface InternalExternal<External = unknown, Internal = unknown> {
  external: External;
  internal: Internal;
}

export interface Controller<External = unknown, Internal = unknown> {
  external: Promise<External>;
  internal: Promise<Internal>;
  terminator: Terminator;
}

export interface PetStore {
  has(petName: string): boolean;
  list(): Array<string>;
  write(petName: string, formulaIdentifier: string): Promise<void>;
  remove(petName: string);
  rename(fromPetName: string, toPetName: string);
  lookup(petName: string): string | undefined;
  reverseLookup(formulaIdentifier: string): Array<string>;
  follow(): Promise<FarRef<String<{ add: string } | { remove: string }>>>;
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

export interface EndoWorker {
  terminate(): void;
  whenTerminated(): Promise<void>;
}

export interface EndoGuest {
  request(what: string, responseName: string): Promise<unknown>;
}

export interface EndoHost {
  listMessages(): Promise<Array<Message>>;
  followMessages(): ERef<AsyncIterable<Message>>;
  lookup(petName: string): Promise<unknown>;
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
  provideGuest(petName?: string): Promise<EndoGuest>;
  provideHost(petName?: string): Promise<EndoHost>;
  makeWorker(petName: string): Promise<EndoWorker>;
  evaluate(
    workerPetName: string | undefined,
    source: string,
    codeNames: Array<string>,
    petNames: Array<string>,
    resultName?: string,
  );
  importUnsafeAndEndow(
    workerPetName: string | undefined,
    importPath: string,
    powersName: string,
    resultName?: string,
  ): Promise<unknown>;
  importBundleAndEndow(
    workerPetName: string | undefined,
    bundleName: string,
    powersName: string,
    resultName?: string,
  ): Promise<unknown>;
}

export type EndoWebBundle = {
  url: string;
  bundle: ERef<EndoReadable>;
  powers: ERef<unknown>;
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
    assertValidName: AssertValidNameFn,
  ) => Promise<FarRef<PetStore>>;
  makeOwnPetStore: (
    name: string,
    assertValidName: AssertValidNameFn,
  ) => Promise<FarRef<PetStore>>;
};

export type NetworkPowers = {
  servePath: (args: {
    path: string;
    host?: string;
    cancelled: Promise<never>;
  }) => Promise<AsyncIterableIterator<Connection>>;
  servePort: (args: {
    port: number;
    host?: string;
    cancelled: Promise<never>;
  }) => Promise<AsyncIterableIterator<Connection>>;
  servePortHttp: (args: {
    port: number;
    host?: string;
    respond?: HttpRespond;
    connect?: HttpConnect;
    cancelled: Promise<never>;
  }) => Promise<number>;
  makePrivatePathService: (
    endoBootstrap: FarRef<unknown>,
    sockPath: string,
    cancelled: Promise<never>,
    exitWithError: (error: Error) => void,
  ) => { started: Promise<void>; stopped: Promise<void> };
  makePrivateHttpService: (
    endoBootstrap: FarRef<unknown>,
    port: number,
    assignWebletPort: (portP: Promise<number>) => void,
    cancelled: Promise<never>,
    exitWithError: (error: Error) => void,
  ) => { started: Promise<void>; stopped: Promise<void> };
};

export type DaemonicPersistencePowers = {
  initializePersistence: () => Promise<void>;
  makeContentSha512Store: () => {
    store: (readable: AsyncIterable<Uint8Array>) => Promise<string>;
    fetch: (sha512: string) => EndoReadable;
  };
  readFormula: (prefix: string, formulaNumber: string) => Promise<Formula>;
  writeFormula: (
    formula: Formula,
    formulaType: string,
    formulaId512: string,
  ) => Promise<void>;
  webPageBundlerFormula?: Formula;
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
  importBundleAndEndow(bundle: ERef<EndoReadable>, powers: ERef<unknown>);
  importUnsafeAndEndow(path: string, powers: ERef<unknown>);
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
