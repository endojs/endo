import makeE from '../src/E.ts';
import { makeHandledPromise } from '../src/handled-promise.js';

export const HandledPromise = makeHandledPromise();
export const E = makeE(HandledPromise);
