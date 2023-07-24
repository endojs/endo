import makeE from './E.js';

const hp = HandledPromise;
export const E = makeE(hp);
export { hp as HandledPromise };

// eslint-disable-next-line import/export
export * from './exports.js';
