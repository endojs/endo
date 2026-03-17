/// <reference types="ses"/>

/* global globalThis */

import { makeDelay } from './delay-lite.js';

/**
 * Returns a promise that fulfills with undefined after ms milliseconds,
 * or rejects if parentCancelled is triggered, whichever comes first.
 *
 * @type {ReturnType<typeof makeDelay>}
 */
export const delay = makeDelay(globalThis.setTimeout);
