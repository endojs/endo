import { value } from './indirect.js';
import { set } from './direct.js';

const secret = {};
set(secret);
if (value !== secret) {
  throw new Error('Implicit reexport did not propagate change');
}
