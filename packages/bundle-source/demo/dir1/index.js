import { encourage, makeError } from './encourage.js';
import more from './sub/more.cjs';

export default function makeEncourager() {
  return harden({
    encourage,
    makeError,
    makeError2: msg => TypeError(msg),
    more,
  });
}
