import * as fs from 'fs';
import { readFileSync } from 'fs';

assert(fs[Symbol.toStringTag] === 'Module');
assert(typeof readFileSync === 'function');
