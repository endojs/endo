import test from '@endo/ses-ava/test.js';

import harden from '@endo/harden';
import { Far } from '../src/make-far.js';
import { isAtom, assertAtom } from '../src/typeGuards.js';

test('isAtom test', t => {
  const alice = Far('Alice', {});
  t.false(isAtom(alice));
  t.throws(() => assertAtom(alice), {
    message: /A "remotable" cannot be an atom: /,
  });

  const p = Promise.resolve();
  t.false(isAtom(p));
  t.throws(() => assertAtom(p), {
    message:
      /A "promise" cannot be an atom: \(an object\)|Not even Passable: "\[Error: Cannot pass non-frozen objects like (\\"\[Promise\]\\"|\(an object\))\. Use harden\(\)\]": ("\[Promise\]"|\(an object\))/,
  });

  harden(p);

  t.false(isAtom(p));
  t.throws(() => assertAtom(p), {
    message: /A "promise" cannot be an atom: ("\[Promise\]"|\(an object\))/,
  });
});
