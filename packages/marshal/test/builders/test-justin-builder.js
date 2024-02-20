import { test } from '../prepare-test-env-ava.js';

import * as js from '../../src/builders/subgraphBuilder.js';
import { makeJustinBuilder } from '../../src/builders/justinBuilder.js';
import { makeMarshal } from '../../src/marshal.js';
import { decodeToJustin } from '../../src/marshal-justin.js';
import {
  fakeJustinCompartment,
  justinPairs,
} from '../test-marshal-justin-builder.js';

// this only includes the tests that do not use liveSlots

test('justin builder round trip pairs', t => {
  const jsRecognizer = js.makeRecognizer();
  const { toCapData } = makeMarshal(undefined, undefined, {
    // We're turning `errorTagging`` off only for the round trip tests, not in
    // general.
    errorTagging: 'off',
    // TODO retire the old format in justin test cases
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

    const justinBuilder = makeJustinBuilder(false, slots);
    t.is(jsRecognizer(value, justinBuilder), justinExpr);
  }
});

test('justin indented builder round trip pairs', t => {
  const jsRecognizer = js.makeRecognizer();
  const { toCapData } = makeMarshal(undefined, undefined, {
    // We're turning `errorTagging`` off only for the round trip tests, not in
    // general.
    errorTagging: 'off',
    // TODO retire the old format in justin test cases
    serializeBodyFormat: 'capdata',
  });
  for (const [body, _, slots] of justinPairs) {
    const c = fakeJustinCompartment();
    const encoding = JSON.parse(body);
    const justinExpr = decodeToJustin(encoding, true, slots);
    const value = harden(c.evaluate(`(${justinExpr})`));
    const { body: newBody } = toCapData(value);
    t.is(newBody, body);

    const justinBuilder = makeJustinBuilder(true, slots);
    t.is(jsRecognizer(value, justinBuilder), justinExpr);
  }
});
