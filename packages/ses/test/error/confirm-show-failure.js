// This file does not end in ".test.js" because it is not useful as a test
// file. Rather, its purpose is just to run it to see what a `confirm`
// failure looks like.

import '../../ses.js';
import { confirm } from '../../src/error/confirm.js';

lockdown();

confirm.equal(3, 4);
