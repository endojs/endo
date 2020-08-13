import makeE from '../src/E';
import makeHandledPromise from '../src/handled-promise';

export const HandledPromise = makeHandledPromise(Promise);
export const E = makeE(HandledPromise);
