/* eslint-disable no-useless-concat */
import test from '@endo/ses-ava/prepare-endo.js';

import {
  passStyleOf,
  isWellFormedString,
  assertWellFormedString,
} from '../src/passStyleOf.js';

test('test string well formedness behaviors', t => {
  const gcleff1 = '\u{1D11E}';
  const gcleff2 = '\u{D834}\u{DD1E}';
  const gcleff3 = '\u{D834}' + '\u{DD1E}';
  const badcleff1 = '\u{D834}\u{D834}\u{DD1E}';
  const badcleff2 = '\u{D834}\u{DD1E}\u{D834}';
  const badcleff3 = '\u{D834}' + '\u{DD1E}\u{D834}';

  // This test block ensures that the underlying platform behaves as we expect
  t.is(gcleff1, gcleff2);
  t.is(gcleff1, gcleff3);
  t.is(gcleff1.length, 2);
  t.is(gcleff2.length, 2);
  t.is(gcleff3.length, 2);
  // Uses string iterator, which iterates code points if possible, not
  // UTF16 code units
  t.deepEqual([...gcleff1], [gcleff1]);
  t.not(badcleff1, badcleff2);
  t.is(badcleff2, badcleff3);
  t.is(badcleff1.length, 3);
  // But if the string contains lone surrogates, the string iterator will
  // produce those as characters
  t.deepEqual([...badcleff1], ['\u{D834}', gcleff1]);
  t.deepEqual([...badcleff2], [gcleff1, '\u{D834}']);

  t.is(passStyleOf(gcleff1), 'string');
  t.true(isWellFormedString(gcleff1));
  t.notThrows(() => assertWellFormedString(gcleff1));

  t.throws(() => passStyleOf(badcleff1), {
    message: 'Expected well-formed unicode string: "\\ud834𝄞"',
  });
  t.throws(() => passStyleOf(badcleff2), {
    message: 'Expected well-formed unicode string: "𝄞\\ud834"',
  });
  t.false(isWellFormedString(badcleff1));
  t.false(isWellFormedString(badcleff2));
  t.throws(() => assertWellFormedString(badcleff1), {
    message: 'Expected well-formed unicode string: "\\ud834𝄞"',
  });
  t.throws(() => assertWellFormedString(badcleff2), {
    message: 'Expected well-formed unicode string: "𝄞\\ud834"',
  });
});
