import { encourage, makeError } from './encourage.js';
import more from './sub/more.js';

export default function makeEncourager() {
  return harden({
    encourage,
    makeError,
    makeError2: msg => TypeError(msg),
    more,
  });
}
