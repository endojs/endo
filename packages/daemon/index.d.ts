import type { FarRef } from '@endo/far';
import type { Locator } from './src/types.js';

export type { Locator };

export { makeEndoClient } from './src/client.js';
export { makeRefReader, eventualIterator } from './src/ref-reader.js';
export { makeReaderRef } from './src/reader-ref.js';

export async function start(locator?: Locator);
export async function stop(locator?: Locator);
export async function restart(locator?: Locator);
export async function terminate(locator?: Locator);
export async function clean(locator?: Locator);
export async function reset(locator?: Locator);
