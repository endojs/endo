/* global globalThis */

export * from './prepare-test-env-ava.js';

// TODO Use environment-options.js currently in ses/src after factoring it out
// to a new package.
const env = (globalThis.process || {}).env || {};

env.DEBUG = 'label-instances';
