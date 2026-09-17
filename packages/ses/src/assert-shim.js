import { globalThis } from './commons.js';
import { makeAssert } from '@endo/errors-internal';

globalThis.assert = makeAssert(undefined, true);
