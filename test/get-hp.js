import makeE from '../src/E.js';
import { makeHandledPromise } from '../src/index.js';

export const HandledPromise = makeHandledPromise(Promise);
export const E = makeE(HandledPromise);
