export { makeEndoClient } from "./src/client.js";
export function terminate(locator?: {
    statePath: string;
    sockPath: string;
    cachePath: string;
}): Promise<void>;
export function start(locator?: {
    statePath: string;
    sockPath: string;
    cachePath: string;
}): Promise<any>;
export function clean(locator?: {
    statePath: string;
    sockPath: string;
    cachePath: string;
}): Promise<void>;
export function restart(locator?: {
    statePath: string;
    sockPath: string;
    cachePath: string;
}): Promise<any>;
export function stop(locator?: {
    statePath: string;
    sockPath: string;
    cachePath: string;
}): Promise<void>;
export function reset(locator?: {
    statePath: string;
    sockPath: string;
    cachePath: string;
}): Promise<void>;
//# sourceMappingURL=index.d.ts.map