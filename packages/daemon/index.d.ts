export { makeEndoClient } from "./src/client.js";
export function terminate(config?: {
    statePath: string;
    ephemeralStatePath: string;
    sockPath: string;
    cachePath: string;
}): Promise<void>;
export function start(config?: {
    statePath: string;
    ephemeralStatePath: string;
    sockPath: string;
    cachePath: string;
}): Promise<any>;
export function clean(config?: {
    statePath: string;
    ephemeralStatePath: string;
    sockPath: string;
    cachePath: string;
}): Promise<void>;
export function stop(config?: {
    statePath: string;
    ephemeralStatePath: string;
    sockPath: string;
    cachePath: string;
}): Promise<void>;
export function restart(config?: {
    statePath: string;
    ephemeralStatePath: string;
    sockPath: string;
    cachePath: string;
}): Promise<any>;
export function purge(config?: {
    statePath: string;
    ephemeralStatePath: string;
    sockPath: string;
    cachePath: string;
}): Promise<void>;
export { makeRefReader, makeRefIterator } from "./src/ref-reader.js";
export { makeReaderRef, makeIteratorRef } from "./src/reader-ref.js";
//# sourceMappingURL=index.d.ts.map