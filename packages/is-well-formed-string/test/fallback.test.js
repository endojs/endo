// Drives the manual-surrogate-scan arm — the half of this package that exists
// for engines without the built-in, and that no test on Node would otherwise
// ever execute, since `index.js` selects the native arm on every engine CI
// runs. Importing the implementation directly is what makes this possible
// under every ses-ava configuration: forcing the branch by deleting
// `String.prototype.isWellFormed` cannot work under `lockdown()`, where the
// intrinsics are frozen and the deletion throws.
import 'ses';
import test from 'ava';
import { isWellFormedStringFallback } from '../fallback.js';
import { isWellFormedString } from '../index.js';
import { cases } from './cases.js';

test('the fallback arm satisfies the shared contract', t => {
  for (const [label, input, expected] of cases) {
    t.is(isWellFormedStringFallback(input), expected, label);
  }
});

test('both arms agree on every case', t => {
  // The exported predicate resolves to the native arm here (see the guard in
  // `is-well-formed-string.test.js`), so this pins the two implementations to
  // each other rather than each to the table separately.
  for (const [label, input] of cases) {
    t.is(
      isWellFormedStringFallback(input),
      isWellFormedString(input),
      `${label}: the fallback and native arms must not diverge`,
    );
  }
});
