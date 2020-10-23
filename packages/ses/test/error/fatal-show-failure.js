// This file does not end in ".test.js" because it is not useful as a test
// file. Rather, its purpose is just to run it to see what a `fatal.assert`
// failure looks like.

import '../../ses.js';
import { fatal } from '../../src/error/fatal-assert.js';

lockdown();

fatal.assert.equal(3, 4);
