import type { ERef } from '@endo/eventual-send';
import type { Reader, Writer, Stream } from '@endo/stream';

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

export type Worker = Connection & {
  pid: number | undefined;
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

export type DaemonicPowers = {
  env: Record<string, string | undefined>;
  sinkError: (error) => void;
  makeSha512: () => Sha512;
  randomHex512: () => Promise<string>;
  listenOnPath: (
    path: string,
    cancelled: Promise<never>,
  ) => Promise<AsyncIterableIterator<Connection>>;
  serveHttp: (args: {
    port: number;
    respond?: HttpRespond;
    connect?: HttpConnect;
    cancelled: Promise<never>;
  }) => void;
  informParentWhenReady: () => void;
  makeFileReader: (path: string) => Reader<Uint8Array>;
  makeFileWriter: (path: string) => Writer<Uint8Array>;
  readFileText: (path: string) => Promise<string>;
  readDirectory: (path: string) => Promise<Array<string>>;
  writeFileText: (path: string, text: string) => Promise<void>;
  makePath: (path: string) => Promise<void>;
  renamePath: (source: string, target: string) => Promise<void>;
  removePath: (path: string) => Promise<void>;
  joinPath: (...components: Array<string>) => string;
  delay: (ms: number, cancelled: Promise<never>) => Promise<void>;
  makeWorker: (
    id: string,
    path: string,
    logPath: string,
    pidPath: string,
    sockPath: string,
    statePath: string,
    ephemeralStatePath: string,
    cachePath: string,
    cancelled: Promise<never>,
  ) => Promise<Worker>;
  endoWorkerPath: string;
  fileURLToPath: (url: string) => string;
};

export type MignonicPowers = {
  pathToFileURL: (path: string) => string;
  connection: {
    reader: Reader<Uint8Array>;
    writer: Writer<Uint8Array>;
  };
};

type InboxFormula = {
  type: 'inbox';
  store: string;
};

type OutboxFormula = {
  type: 'outbox';
  store: string;
  inbox: string;
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
  outbox: string;
  importPath: string;
  // TODO formula slots
};

type ImportBundleFormula = {
  type: 'import-bundle';
  worker: string;
  outbox: string;
  bundle: string;
  // TODO formula slots
};

type WebBundleFormula = {
  type: 'web-bundle';
  bundle: string;
  powers: string;
};

export type Formula =
  | InboxFormula
  | OutboxFormula
  | EvalFormula
  | ImportUnsafeFormula
  | ImportBundleFormula
  | WebBundleFormula;

export type Label = {
  number: number;
  who: string;
  what: string;
  when: string;
};

export type Request = {
  type: 'request';
  settled: Promise<void>;
};

export type Message = Label & Request;

export interface Topic<
  TRead,
  TWrite = undefined,
  TReadReturn = undefined,
  TWriteReturn = undefined,
> {
  publisher: Stream<TWrite, TRead, TWriteReturn, TReadReturn>;
  subscribe(): Stream<TRead, TWrite, TReadReturn, TWriteReturn>;
}

export interface PetStore {
  get(petName: string): string | undefined;
  write(petName: string, formulaIdentifier: string): Promise<void>;
  list(): Array<string>;
  remove(petName: string);
  rename(fromPetName: string, toPetName: string);
  lookup(formulaIdentifier: string): Array<string>;
}

export type RequestFn = (
  what: string,
  responseName: string,
  outbox: object,
  outboxPetStore: PetStore,
) => Promise<unknown>;

export interface EndoReadable {
  sha512(): string;
  stream(): ERef<Reader<Uint8Array>>;
  text(): Promise<string>;
  json(): Promise<unknown>;
  [Symbol.asyncIterator]: Reader<Uint8Array>;
}

export interface EndoWorker {
  terminate(): void;
  whenTerminated(): Promise<void>;
}

export interface EndoOutbox {
  request(what: string, responseName: string): Promise<unknown>;
}

export interface EndoInbox {
  listMessages(): Promise<Array<Message>>;
  followMessages(): ERef<AsyncIterable<Message>>;
  provide(petName: string): Promise<unknown>;
  resolve(requestNumber: number, petName: string);
  reject(requestNumber: number, message: string);
  lookup(ref: object): Promise<Array<string>>;
  remove(petName: string);
  rename(fromPetName: string, toPetName: string);
  list(): Array<string>; // pet names
  store(
    readerRef: ERef<AsyncIterableIterator<string>>,
    petName: string,
  ): Promise<void>;
  makeOutbox(petName?: string): Promise<EndoOutbox>;
  makeInbox(petName?: string): Promise<EndoInbox>;
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
    outboxName: string,
    resultName?: string,
  ): Promise<unknown>;
  importBundleAndEndow(
    workerPetName: string | undefined,
    bundleName: string,
    outboxName: string,
    resultName?: string,
  ): Promise<unknown>;
}

export type EndoWebBundle = {
  url: string;
  bundle: ERef<EndoReadable>;
  powers: ERef<unknown>;
};
