import type { Passable } from '@endo/pass-style';
import { expectNotType, expectType } from 'tsd';
import { isKey, isScalarKey } from '../src/keys/checkKey.js';
import { M } from '../src/patterns/patternMatchers.js';
import type { Key, ScalarKey } from '../src/types.js';

// @ts-expect-error M.any missing parens
M.arrayOf(M.any);
M.arrayOf(M.any());

const passable: Passable = null as any;
{
  const result = isKey(passable);
  expectType<boolean>(result);
  if (result) {
    expectType<Key>(passable);
  } else {
    expectNotType<Key>(passable);
  }
}
{
  const str = 'some string';
  if (isKey(str)) {
    // doesn't widen
    expectType<string>(str);
  }
}

{
  const someAny: any = null;
  someAny.foo;
  if (isKey(someAny)) {
    // still any
    someAny.foo;
  }
}

{
  const result = isScalarKey(passable);
  expectType<boolean>(result);
  if (result) {
    expectType<ScalarKey>(passable);
  } else {
    expectNotType<ScalarKey>(passable);
  }
}
