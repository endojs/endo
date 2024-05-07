export function makeSocketPowers({ net }: {
    net: typeof import('net');
}): SocketPowers;
export function makeNetworkPowers({ net }: {
    net: typeof import('net');
}): NetworkPowers;
export function makeFilePowers({ fs, path: fspath }: {
    fs: any;
    path: any;
}): {
    makeFileReader: (path: string) => Reader<Uint8Array, undefined>;
    makeFileWriter: (path: string) => Writer<Uint8Array>;
    writeFileText: (path: string, text: string) => Promise<void>;
    readFileText: (path: string) => Promise<any>;
    maybeReadFileText: (path: string) => Promise<any>;
    readDirectory: (path: string) => Promise<any>;
    makePath: (path: string) => Promise<void>;
    joinPath: (...components: any[]) => any;
    removePath: (path: string) => Promise<void>;
    renamePath: (source: any, target: any) => Promise<void>;
};
export function makeCryptoPowers(crypto: typeof import('crypto')): CryptoPowers;
export function makeDaemonicPersistencePowers(filePowers: FilePowers, cryptoPowers: CryptoPowers, config: Config): DaemonicPersistencePowers;
export function makeDaemonicControlPowers(config: Config, fileURLToPath: typeof import("url").fileURLToPath, filePowers: FilePowers, fs: typeof import('fs'), popen: typeof import('child_process')): {
    makeWorker: (workerId: string, daemonWorkerFacet: DaemonWorkerFacet, cancelled: Promise<never>) => Promise<{
        workerTerminated: Promise<any>;
        workerDaemonFacet: PromiseLike<WorkerDaemonFacet>;
    }>;
};
export function makeDaemonicPowers({ config, fs, popen, url, filePowers, cryptoPowers, }: {
    config: Config;
    fs: typeof import('fs');
    popen: typeof import('child_process');
    url: typeof import('url');
    filePowers: FilePowers;
    cryptoPowers: CryptoPowers;
}): DaemonicPowers;
import type { SocketPowers } from './types.js';
import type { NetworkPowers } from './types.js';
import type { Reader } from '@endo/stream';
import type { Writer } from '@endo/stream';
import type { CryptoPowers } from './types.js';
import type { FilePowers } from './types.js';
import type { Config } from './types.js';
import type { DaemonicPersistencePowers } from './types.js';
import type { DaemonWorkerFacet } from './types.js';
import type { WorkerDaemonFacet } from './types.js';
import type { DaemonicPowers } from './types.js';
//# sourceMappingURL=daemon-node-powers.d.ts.map