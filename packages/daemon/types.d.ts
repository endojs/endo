export { makeRefReader, makeRefIterator } from './src/ref-reader.js';
export { makeReaderRef, makeIteratorRef } from './src/reader-ref.js';

export type Config = {
  statePath: string;
  ephemeralStatePath: string;
  cachePath: string;
  sockPath: string;
};

export function start(config?: Config);
export function stop(config?: Config);
export function restart(config?: Config);
export function terminate(config?: Config);
export function clean(config?: Config);
export function purge(config?: Config);
export function makeEndoClient<TBootstrap>(
  name: string,
  sockPath: string,
  cancelled: Promise<void>,
  bootstrap?: TBootstrap,
);
