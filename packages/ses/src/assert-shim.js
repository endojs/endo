import { globalThis } from './commons.js';
import { makeAssert } from './error/assert.js';

globalThis.assert = makeAssert(undefined, true);
