import test from '@endo/ses-ava/test.js';

import harden from '@endo/harden';
import {
  makeGrantDetails,
  makeGrantTracker,
} from '../src/client/grant-tracker.js';

/** @import { OcapnLocation } from '../src/codecs/components.js' */
/** @import { SwissNum } from '../src/client/types.js' */
/** @import { Slot } from '../src/captp/types.js' */

const swissNum = /** @param {string} s @returns {SwissNum} */ s =>
  /** @type {SwissNum} */ (/** @type {unknown} */ (s));

const fakeLocation = /** @type {OcapnLocation} */ (
  harden({
    type: 'ocapn-peer',
    designator: 'a'.repeat(64),
    transport: 'tcp-testing-only',
    hints: {},
  })
);

const fakeSlot = /** @type {Slot} */ (
  /** @type {unknown} */ (harden({ type: 'import', position: 0 }))
);

test('makeGrantDetails creates handoff grant', t => {
  const details = makeGrantDetails(fakeLocation, fakeSlot, 'handoff');
  t.is(details.type, 'handoff');
  t.is(details.swissNum, undefined);
});

test('makeGrantDetails creates sturdy-ref grant', t => {
  const details = makeGrantDetails(
    fakeLocation,
    fakeSlot,
    'sturdy-ref',
    swissNum('swiss123'),
  );
  t.is(details.type, 'sturdy-ref');
  t.is(details.swissNum, swissNum('swiss123'));
});

test('makeGrantDetails rejects invalid type', t => {
  t.throws(
    () =>
      makeGrantDetails(fakeLocation, fakeSlot, /** @type {any} */ ('invalid')),
    { message: /Invalid grant type/ },
  );
});

test('makeGrantDetails rejects sturdy-ref without swissNum', t => {
  t.throws(() => makeGrantDetails(fakeLocation, fakeSlot, 'sturdy-ref'), {
    message: /must have a swiss num/,
  });
});

test('makeGrantDetails rejects handoff with swissNum', t => {
  t.throws(
    () =>
      makeGrantDetails(fakeLocation, fakeSlot, 'handoff', swissNum('swiss123')),
    { message: /must not have a swiss num/ },
  );
});

test('makeGrantTracker records and retrieves imports', t => {
  const tracker = makeGrantTracker();
  const remotable = harden({ __proto__: null });
  const details = makeGrantDetails(fakeLocation, fakeSlot, 'handoff');
  tracker.recordImport(remotable, details);
  t.deepEqual(tracker.getGrantDetails(remotable), details);
});

test('makeGrantTracker returns undefined for unknown remotable', t => {
  const tracker = makeGrantTracker();
  t.is(tracker.getGrantDetails(harden({})), undefined);
});

test('makeGrantTracker allows handoff -> sturdy-ref upgrade', t => {
  const tracker = makeGrantTracker();
  const remotable = harden({ __proto__: null });
  const handoff = makeGrantDetails(fakeLocation, fakeSlot, 'handoff');
  const sturdy = makeGrantDetails(
    fakeLocation,
    fakeSlot,
    'sturdy-ref',
    swissNum('swiss456'),
  );
  tracker.recordImport(remotable, handoff);
  t.notThrows(() => tracker.recordImport(remotable, sturdy));
  t.is(tracker.getGrantDetails(remotable)?.type, 'sturdy-ref');
});

test('makeGrantTracker rejects invalid grant type transition', t => {
  const tracker = makeGrantTracker();
  const remotable = harden({ __proto__: null });
  const sturdy = makeGrantDetails(
    fakeLocation,
    fakeSlot,
    'sturdy-ref',
    swissNum('swiss789'),
  );
  const handoff = makeGrantDetails(fakeLocation, fakeSlot, 'handoff');
  tracker.recordImport(remotable, sturdy);
  t.throws(() => tracker.recordImport(remotable, handoff), {
    message: /Invalid grant type transition/,
  });
});
