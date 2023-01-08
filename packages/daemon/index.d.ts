import type { FarRef } from '@endo/far';

type Locator = {
  statePath: string;
  ephemeralStatePath: string;
  cachePath: string;
  sockPath: string;
};

export { makeEndoClient } from './src/client.js';
export { makeRefReader, eventualIterator } from './src/ref-reader.js';
export { makeReaderRef } from './src/reader-ref.js';

export async function start(locator?: Locator);
export async function stop(locator?: Locator);
export async function restart(locator?: Locator);
export async function terminate(locator?: Locator);
export async function clean(locator?: Locator);
export async function reset(locator?: Locator);
