import 'ses';

import test from 'ava';
import { scaffold } from './scaffold.js';

/**
 * @import {FixtureAssertionFn} from './test.types.js';
 */

const fixture = new URL('fixtures-noble/index.js', import.meta.url).toString();

/**
 * @type {FixtureAssertionFn<unknown>}
 */
const assertFixture = (t, { namespace }) => {
  t.pass();
};

const fixtureAssertionCount = 1;

scaffold(
  'fixtures-noble (infer module type from pkg.json exports)',
  test,
  fixture,
  assertFixture,
  fixtureAssertionCount,
  {
    addGlobals: {
      console: {
        log: () => {},
      },
    },
  },
);
