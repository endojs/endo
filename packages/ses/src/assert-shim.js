import { globalThis } from '@endo/error-console-internal/commons.js';
import { makeAssert } from '@endo/error-console-internal';

globalThis.assert = makeAssert(undefined, true);
