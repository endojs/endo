import test from '@endo/ses-ava/test.js';

import { Far } from '../src/make-far.js';
import { isAtom, assertAtom } from '../src/typeGuards.js';

test('isAtom test', t => {
  const alice = Far('Alice', {});
  t.false(isAtom(alice));
  t.throws(() => assertAtom(alice), {
    message: 'A "remotable" cannot be an atom: "[Alleged: Alice]"',
  });

  const p = Promise.resolve();
  t.false(isAtom(p));
  t.throws(() => assertAtom(p), {
    message:
      'Not even Passable: "[Error: Cannot pass non-frozen objects like \\"[Promise]\\". Use harden()]": "[Promise]"',
  });

  harden(p);

  t.false(isAtom(p));
  t.throws(() => assertAtom(p), {
    message: 'A "promise" cannot be an atom: "[Promise]"',
  });
});
