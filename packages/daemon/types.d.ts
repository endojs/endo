import type { Config, EndoBootstrap } from './src/types.js';

export { makeRefReader, makeRefIterator } from './src/ref-reader.js';
export { makeReaderRef, makeIteratorRef } from './src/reader-ref.js';

export type { Config };
export function start(config?: Config): Promise<void>;
export function stop(config?: Config): Promise<void>;
export function restart(config?: Config): Promise<void>;
export function terminate(config?: Config): Promise<void>;
export function clean(config?: Config): Promise<void>;
export function purge(config?: Config): Promise<void>;
export function makeEndoClient<TBootstrap>(
  name: string,
  sockPath: string,
  cancelled: Promise<void>,
  bootstrap?: TBootstrap,
): Promise<{
  getBootstrap: () => Promise<EndoBootstrap>;
  closed: Promise<void>;
}>;
