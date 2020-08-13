import makeE from '../src/E';
import { makeHandledPromise } from '../src/index';

export const HandledPromise = makeHandledPromise(Promise);
export const E = makeE(HandledPromise);
