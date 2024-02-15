export { makeRefReader, makeRefIterator } from './src/ref-reader.js';
export { makeReaderRef, makeIteratorRef } from './src/reader-ref.js';

export type Locator = {
  statePath: string;
  httpPort?: number;
  ephemeralStatePath: string;
  cachePath: string;
  sockPath: string;
};

export function start(locator?: Locator);
export function stop(locator?: Locator);
export function restart(locator?: Locator);
export function terminate(locator?: Locator);
export function clean(locator?: Locator);
export function purge(locator?: Locator);
export function makeEndoClient<TBootstrap>(
  name: string,
  sockPath: string,
  cancelled: Promise<void>,
  bootstrap?: TBootstrap,
);
