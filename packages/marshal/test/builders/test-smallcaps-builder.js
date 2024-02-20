import { test } from '../prepare-test-env-ava.js';

import * as sc from '../../src/builders/smallcapsBuilder.js';
import * as js from '../../src/builders/subgraphBuilder.js';
import { roundTripPairs } from '../test-marshal-capdata.js';
import { makeSmallcapsTestMarshal } from '../test-marshal-smallcaps-builder.js';

const { isFrozen } = Object;

test('smallcaps builder', t => {
  const scBuilder = sc.makeBuilder();
  const scRecognizer = sc.makeRecognizer();
  t.is(scRecognizer('#Infinity', scBuilder), '#Infinity');

  const jsBuilder = js.makeBuilder();
  const jsRecognizer = js.makeRecognizer();
  t.is(jsRecognizer(Infinity, jsBuilder), Infinity);
  t.is(scRecognizer('#Infinity', jsBuilder), Infinity);
  t.is(jsRecognizer(Infinity, scBuilder), '#Infinity');
});

test('smallcaps builder round trip half pairs', t => {
  const scBuilder = sc.makeBuilder();
  const scRecognizer = sc.makeRecognizer();
  const jsBuilder = js.makeBuilder();
  const jsRecognizer = js.makeRecognizer();
  const { toCapData, fromCapData } = makeSmallcapsTestMarshal();
  for (const [plain, _] of roundTripPairs) {
    const { body } = toCapData(plain);
    const encoding = JSON.parse(body.slice(1));
    const decoding = fromCapData({ body, slots: [] });
    t.deepEqual(decoding, plain);
    t.assert(isFrozen(decoding));

    t.deepEqual(scRecognizer(encoding, scBuilder), encoding);
    t.deepEqual(jsRecognizer(plain, jsBuilder), plain);
    t.deepEqual(scRecognizer(encoding, jsBuilder), plain);
    t.deepEqual(jsRecognizer(plain, scBuilder), encoding);
  }
});
