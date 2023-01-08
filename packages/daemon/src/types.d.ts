import type { Reader, Writer } from '@endo/stream';

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
  randomUuid: () => string;
  listenOnPath: (
    path: string,
    cancelled: Promise<never>,
  ) => Promise<AsyncIterableIterator<Connection>>;
  informParentWhenListeningOnPath: (path: string) => void;
  makeFileReader: (path: string) => Reader<Uint8Array>;
  makeFileWriter: (path: string) => Writer<Uint8Array>;
  readFileText: (path: string) => Promise<string>;
  writeFileText: (path: string, text: string) => Promise<void>;
  makePath: (path: string) => Promise<void>;
  renamePath: (source: string, target: string) => Promise<void>;
  joinPath: (...components: Array<string>) => string;
  delay: (ms: number, cancelled: Promise<never>) => Promise<void>;
  makeWorker: (
    uuid: string,
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
  connection: {
    reader: Reader<Uint8Array>;
    writer: Writer<Uint8Array>;
  };
};

type ReadableSha512Ref = {
  type: 'readableSha512';
  readableSha512: string;
};

type WorkerUuidRef = {
  type: 'workerUuid';
  workerUuid: string;
};

// Reference to a reference.
type ValueUuid = {
  type: 'valueUuid';
  valueUuid: string;
};

type EvalRef = {
  type: 'eval';
  workerUuid: string;
  source: string;
  // Behold: recursion
  // eslint-disable-next-line no-use-before-define
  refs: Record<string, Ref>;
};

export type Ref = ReadableSha512Ref | WorkerUuidRef | ValueUuid | EvalRef;
