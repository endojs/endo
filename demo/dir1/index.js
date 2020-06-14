import harden from '@agoric/harden';
import { encourage, makeError } from './encourage';
import more from './sub/more';

export default function makeEncourager() {
  return harden({
    encourage,
    makeError,
    makeError2: msg => TypeError(msg),
    more,
  });
}
