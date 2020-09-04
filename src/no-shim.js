/* global HandledPromise */
import makeE from './E';

const hp = HandledPromise;
export const E = makeE(HandledPromise);
export { hp as HandledPromise };
