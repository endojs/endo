import makeE from '../src/E.js';
import { makeHandledPromise } from '../src/handled-promise.js';

export const HandledPromise = makeHandledPromise(Promise);
export const E = makeE(HandledPromise);
