// This file does not end in ".test.js" because it is not useful as a test
// file. Rather, its purpose is just to run it to see what a `vat.assert`
// failure looks like.

import '../../ses.js';
import { vat } from '../../src/error/vat-assert.js';

lockdown();

vat.assert.equal(3, 4);
