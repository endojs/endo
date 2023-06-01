/* global globalThis */

export * from './prepare-test-env-ava.js';

const env = (globalThis.process || {}).env || {};

env.DEBUG = 'label-instances';
