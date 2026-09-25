import test from '@endo/ses-ava/prepare-endo.js';

// eslint-disable-next-line import/order
import { makeMarshal } from '../../src/marshal.js';
import { decodeToJustin } from '../../src/marshal-justin.js';
import { fakeJustinCompartment, justinPairs } from './_builder-test-data.js';

// this only includes the tests that do not use liveSlots

test('serialize decodeToJustin eval round trip pairs', t => {
  const { toCapData } = makeMarshal(undefined, undefined, {
    // We're turning `errorTagging`` off only for the round trip tests, not in
    // general.
    errorTagging: 'off',
    // TODO make Justin work with smallcaps
    serializeBodyFormat: 'capdata',
  });
  for (const [body, justinSrc, slots] of justinPairs) {
    const c = fakeJustinCompartment();
    const encoding = JSON.parse(body);
    const justinExpr = decodeToJustin(encoding, false, slots);
    t.is(justinExpr, justinSrc);
    const value = harden(c.evaluate(`(${justinExpr})`));
    const { body: newBody } = toCapData(value);
    t.is(newBody, body);
  }
});

// Like "serialize decodeToJustin eval round trip pairs" but uses the indented
// representation *without* checking its specific whitespace decisions.
// Just checks that it has equivalent evaluation, and
// that the decoder passes the extra `level` balancing diagnostic in
// `makeYesIndenter`.
test('serialize decodeToJustin indented eval round trip', t => {
  const { toCapData } = makeMarshal(undefined, undefined, {
    // We're turning `errorTagging`` off only for the round trip tests, not in
    // general.
    errorTagging: 'off',
    // TODO make Justin work with smallcaps
    serializeBodyFormat: 'capdata',
  });
  for (const [body, _, slots] of justinPairs) {
    const c = fakeJustinCompartment();
    t.log(body);
    const encoding = JSON.parse(body);
    const justinExpr = decodeToJustin(encoding, true, slots);
    const value = harden(c.evaluate(`(${justinExpr})`));
    const { body: newBody } = toCapData(value);
    t.is(newBody, body);
  }
});
