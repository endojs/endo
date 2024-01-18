/// <reference types="node" />
/// <reference types="node" />
/**
 * The implementation of `makeReadPowers` and the deprecated
 * `makeNodeReadPowers` handles the case when the `url` power is not provided,
 * but `makeReadPowers` presents a type that requires `url`.
 *
 * @param {object} args
 * @param {typeof import('fs')} args.fs
 * @param {typeof import('url')} [args.url]
 * @param {typeof import('crypto')} [args.crypto]
 */
export function makeReadPowers({ fs, url, crypto }: {
    fs: typeof import('fs');
    url?: typeof import("url") | undefined;
    crypto?: typeof import("crypto") | undefined;
}): {
    read: (location: string) => Promise<Buffer>;
    maybeRead: (location: string) => Promise<Buffer | undefined>;
    fileURLToPath: (location: string) => string;
    pathToFileURL: ((path: string) => string) | typeof import("url").pathToFileURL;
    canonical: (location: string) => Promise<string>;
    computeSha512: import("./types.js").HashFn | undefined;
    requireResolve: (from: any, specifier: any, options: any) => string;
};
/**
 * The implementation of `makeWritePowers` and the deprecated
 * `makeNodeWritePowers` handles the case when the `url` power is not provided,
 * but `makeWritePowers` presents a type that requires `url`.
 *
 * @param {object} args
 * @param {typeof import('fs')} args.fs
 * @param {typeof import('url')} [args.url]
 */
export function makeWritePowers({ fs, url }: {
    fs: typeof import('fs');
    url?: typeof import("url") | undefined;
}): {
    write: (location: string, data: Uint8Array) => Promise<void>;
};
export function makeNodeReadPowers(fs: typeof import('fs'), crypto?: typeof import("crypto") | undefined): ReadPowers;
export function makeNodeWritePowers(fs: typeof import('fs')): WritePowers;
export type ReadPowers = import('./types.js').ReadPowers;
export type HashFn = import('./types.js').HashFn;
export type WritePowers = import('./types.js').WritePowers;
//# sourceMappingURL=node-powers.d.ts.map