import type { Passable } from '@endo/pass-style';
import { expectNotType, expectType } from 'tsd';
import { isKey } from '../src/keys/checkKey.js';
import { M } from '../src/patterns/patternMatchers.js';
import type { Key } from '../src/types.js';

// @ts-expect-error M.any missing parens
M.arrayOf(M.any);
M.arrayOf(M.any());

{
  const maybeKey: Passable = 'key';
  const result = isKey(maybeKey);
  expectType<boolean>(result);
  if (result) {
    expectType<Key>(maybeKey);
  } else {
    expectNotType<Key>(maybeKey);
  }
}
