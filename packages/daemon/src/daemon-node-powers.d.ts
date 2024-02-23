export function makeHttpPowers({ http, ws }: {
    ws: typeof import('ws');
    http: typeof import('http');
}): {
    servePortHttp: ({ port, host, respond, connect, cancelled, }: {
        port: number;
        host: string;
        respond?: import("./types.js").HttpRespond | undefined;
        connect?: import("./types.js").HttpConnect | undefined;
        cancelled: Promise<never>;
    }) => Promise<any>;
};
export function makeSocketPowers({ net }: {
    net: typeof import('net');
}): import('./types.js').SocketPowers;
export function makeNetworkPowers({ http, ws, net }: {
    net: typeof import('net');
    http: typeof import('http');
    ws: typeof import('ws');
}): import('./types.js').NetworkPowers;
export function makeFilePowers({ fs, path: fspath }: {
    fs: any;
    path: any;
}): {
    makeFileReader: (path: string) => import("@endo/stream").Reader<Uint8Array, undefined>;
    makeFileWriter: (path: string) => import('@endo/stream').Writer<Uint8Array>;
    writeFileText: (path: string, text: string) => Promise<void>;
    readFileText: (path: string) => Promise<any>;
    maybeReadFileText: (path: string) => Promise<any>;
    readDirectory: (path: string) => Promise<any>;
    makePath: (path: string) => Promise<void>;
    joinPath: (...components: any[]) => any;
    removePath: (path: string) => Promise<void>;
    renamePath: (source: any, target: any) => Promise<void>;
};
export function makeCryptoPowers(crypto: typeof import('crypto')): import('./types.js').CryptoPowers;
export function makeDaemonicPersistencePowers(fileURLToPath: (URL: any) => string, filePowers: import('./types.js').FilePowers, cryptoPowers: import('./types.js').CryptoPowers, locator: import('./types.js').Locator, includeWebPageBundler?: boolean | undefined): import('./types.js').DaemonicPersistencePowers;
export function makeDaemonicControlPowers(locator: any, fileURLToPath: any, filePowers: any, fs: any, popen: any): {
    makeWorker: (workerId: string, daemonWorkerFacet: import('./types.js').DaemonWorkerFacet, cancelled: Promise<never>) => Promise<{
        workerTerminated: Promise<any>;
        workerDaemonFacet: PromiseLike<import("./types.js").WorkerDaemonFacet>;
    }>;
};
export function makeDaemonicPowers({ locator, fs, popen, url, filePowers, cryptoPowers, }: {
    locator: import('./types.js').Locator;
    fs: typeof import('fs');
    popen: typeof import('child_process');
    url: typeof import('url');
    filePowers: import('./types.js').FilePowers;
    cryptoPowers: import('./types.js').CryptoPowers;
}): import('./types.js').DaemonicPowers;
//# sourceMappingURL=daemon-node-powers.d.ts.map