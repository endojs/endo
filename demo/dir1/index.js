import harden from '@agoric/harden';
import { encourage } from './encourage';

export default function makeEncourager() {
  return harden({
    encourage,
  });
};
