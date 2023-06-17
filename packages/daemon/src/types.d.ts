import type { Reader, Writer, Stream } from '@endo/stream';

export type Locator = {
  statePath: string;
  ephemeralStatePath: string;
  cachePath: string;
  sockPath: string;
};

export type Sha512 = {
  update: (chunk: Uint8Array) => void;
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

export type DaemonicPowers = {
  sinkError: (error) => void;
  exitOnError: (error) => void;
  makeSha512: () => Sha512;
  randomHex512: () => Promise<string>;
  listenOnPath: (
    path: string,
    cancelled: Promise<never>,
  ) => Promise<AsyncIterableIterator<Connection>>;
  informParentWhenListeningOnPath: (path: string) => void;
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
};

export type MignonicPowers = {
  exitOnError: (error) => void;
  pathToFileURL: (path: string) => string;
  connection: {
    reader: Reader<Uint8Array>;
    writer: Writer<Uint8Array>;
  };
};

type EvalFormula = {
  type: 'eval';
  worker: string;
  source: string;
  names: Array<string>; // lexical names
  values: Array<string>; // formula identifiers
  // TODO formula slots
};

type ImportUnsafe0Formula = {
  type: 'import-unsafe0';
  worker: string;
  importPath: string;
  // TODO formula slots
};

type ImportBundle0Formula = {
  type: 'import-bundle0';
  worker: string;
  bundle: string;
  // TODO formula slots
};

export type Formula = EvalFormula | ImportUnsafe0Formula | ImportBundle0Formula;

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
  lookup(formulaIdentifier: string): Array<string>;
}
