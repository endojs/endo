export { makeEndoClient } from "./src/client.js";
export function terminate(locator?: {
    statePath: string;
    ephemeralStatePath: string;
    sockPath: string;
    cachePath: string;
}): Promise<void>;
export function start(locator?: {
    statePath: string;
    ephemeralStatePath: string;
    sockPath: string;
    cachePath: string;
}): Promise<any>;
export function clean(locator?: {
    statePath: string;
    ephemeralStatePath: string;
    sockPath: string;
    cachePath: string;
}): Promise<void>;
export function restart(locator?: {
    statePath: string;
    ephemeralStatePath: string;
    sockPath: string;
    cachePath: string;
}): Promise<any>;
export function stop(locator?: {
    statePath: string;
    ephemeralStatePath: string;
    sockPath: string;
    cachePath: string;
}): Promise<void>;
export function purge(locator?: {
    statePath: string;
    ephemeralStatePath: string;
    sockPath: string;
    cachePath: string;
}): Promise<void>;
export { makeRefReader, makeRefIterator } from "./src/ref-reader.js";
export { makeReaderRef, makeIteratorRef } from "./src/reader-ref.js";
//# sourceMappingURL=index.d.ts.map