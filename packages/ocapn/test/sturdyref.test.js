// @ts-check

import test from '@endo/ses-ava/test.js';
import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';
import { passStyleOf } from '@endo/pass-style';
import { testWithErrorUnwrapping, makeTestClient } from './_util.js';
import { encodeSwissnum } from '../src/client/util.js';
import { isSturdyRef, getSturdyRefDetails } from '../src/client/sturdyrefs.js';
import { ocapnPassStyleOf } from '../src/codecs/ocapn-pass-style.js';

testWithErrorUnwrapping('SturdyRef is a tagged type', async t => {
  const { client: clientA, location: locationB } = await makeTestClient({
    debugLabel: 'A',
  });
  const { client: clientB } = await makeTestClient({ debugLabel: 'B' });

  const sturdyRef = clientA.makeSturdyRef(
    locationB,
    encodeSwissnum('test-object'),
  );

  // SturdyRef should be a tagged type
  t.is(passStyleOf(sturdyRef), 'tagged', 'passStyleOf returns tagged');
  t.is(
    ocapnPassStyleOf(sturdyRef),
    'sturdyref',
    'ocapnPassStyleOf returns sturdyref',
  );
  t.is(
    sturdyRef[Symbol.toStringTag],
    'ocapn-sturdyref',
    'has correct tag name',
  );
  t.is(sturdyRef.payload, undefined, 'payload is undefined');

  clientA.shutdown();
  clientB.shutdown();
});

testWithErrorUnwrapping(
  "SturdyRef doesn't expose swissnum/location",
  async t => {
    const { client: clientA, location: locationB } = await makeTestClient({
      debugLabel: 'A',
    });
    const { client: clientB } = await makeTestClient({ debugLabel: 'B' });

    const swissNum = encodeSwissnum('test-object');
    const sturdyRef = clientA.makeSturdyRef(locationB, swissNum);

    // Check that the object doesn't expose internals
    t.false('location' in sturdyRef, 'no location property');
    t.false('swissNum' in sturdyRef, 'no swissNum property');
    t.false('swissnum' in sturdyRef, 'no swissnum property');

    // Check stringification shows the tag but doesn't leak internals
    const stringified = String(sturdyRef);
    t.is(
      stringified,
      '[object ocapn-sturdyref]',
      'stringification shows tag name',
    );

    clientA.shutdown();
    clientB.shutdown();
  },
);

testWithErrorUnwrapping(
  'isSturdyRef correctly identifies SturdyRefs',
  async t => {
    const { client: clientA, location: locationB } = await makeTestClient({
      debugLabel: 'A',
    });
    const { client: clientB } = await makeTestClient({ debugLabel: 'B' });

    const sturdyRef = clientA.makeSturdyRef(locationB, encodeSwissnum('test'));

    t.true(isSturdyRef(sturdyRef), 'isSturdyRef returns true for SturdyRef');
    t.false(isSturdyRef({}), 'isSturdyRef returns false for plain object');
    t.false(isSturdyRef(null), 'isSturdyRef returns false for null');
    t.false(isSturdyRef(undefined), 'isSturdyRef returns false for undefined');
    t.false(isSturdyRef('string'), 'isSturdyRef returns false for string');

    clientA.shutdown();
    clientB.shutdown();
  },
);

testWithErrorUnwrapping(
  'getSturdyRefDetails returns correct details',
  async t => {
    const { client: clientA, location: locationB } = await makeTestClient({
      debugLabel: 'A',
    });
    const { client: clientB } = await makeTestClient({ debugLabel: 'B' });

    const swissNum = encodeSwissnum('test-object');
    const sturdyRef = clientA.makeSturdyRef(locationB, swissNum);

    const details = getSturdyRefDetails(sturdyRef);
    t.truthy(details, 'getSturdyRefDetails returns details');
    if (details) {
      t.deepEqual(details.location, locationB, 'location matches');
      t.deepEqual(details.swissNum, swissNum, 'swissNum matches');
    }

    // getSturdyRefDetails returns undefined for non-SturdyRef
    const notASturdyRef = {};
    // @ts-expect-error - intentionally passing wrong type to test
    const noDetails = getSturdyRefDetails(notASturdyRef);
    t.is(
      noDetails,
      undefined,
      'getSturdyRefDetails returns undefined for non-SturdyRef',
    );

    clientA.shutdown();
    clientB.shutdown();
  },
);

test('client.enlivenSturdyRef() returns promise for fetched value', async t => {
  const testObjectTable = new Map();
  const testObject = Far('TestObject', {
    getValue: () => 42,
  });
  testObjectTable.set('test-object', testObject);

  const { client: clientA } = await makeTestClient({ debugLabel: 'A' });
  const { client: clientB, location: locationB } = await makeTestClient({
    debugLabel: 'B',
    makeDefaultSwissnumTable: () => testObjectTable,
  });

  const sturdyRef = clientA.makeSturdyRef(
    locationB,
    encodeSwissnum('test-object'),
  );

  const enlivenResult = clientA.enlivenSturdyRef(sturdyRef);
  t.truthy(enlivenResult, 'enlivenSturdyRef returns something');
  t.truthy(
    enlivenResult instanceof Promise,
    'enlivenSturdyRef returns a promise',
  );

  const resolved = await enlivenResult;
  const value = await E(resolved).getValue();
  t.is(value, 42, 'fetched value works correctly');

  clientA.shutdown();
  clientB.shutdown();
});

test('Enlivened values are not SturdyRefs', async t => {
  const testObjectTable = new Map();
  const testObject = Far('TestObject', {
    getValue: () => 42,
  });
  testObjectTable.set('test-object', testObject);

  const { client: clientA } = await makeTestClient({ debugLabel: 'A' });
  const { client: clientB, location: locationB } = await makeTestClient({
    debugLabel: 'B',
    makeDefaultSwissnumTable: () => testObjectTable,
  });

  const sturdyRef = clientA.makeSturdyRef(
    locationB,
    encodeSwissnum('test-object'),
  );

  // Verify sturdyRef is a SturdyRef before enliven
  t.true(isSturdyRef(sturdyRef), 'sturdyRef is a SturdyRef before enliven');

  // Enliven the sturdyref
  const enlivened = await clientA.enlivenSturdyRef(sturdyRef);

  // Verify the enlivened value is NOT a SturdyRef
  t.false(isSturdyRef(enlivened), 'enlivened value is not a SturdyRef');

  // Verify the enlivened value works
  const value = await E(enlivened).getValue();
  t.is(value, 42, 'enlivened value works correctly');

  clientA.shutdown();
  clientB.shutdown();
});

test('SturdyRef to self-location can be enlivened', async t => {
  const testObjectTable = new Map();
  const testObject = Far('TestObject', {
    getValue: () => 42,
  });
  testObjectTable.set('test-object', testObject);

  const { client: clientA, location: locationA } = await makeTestClient({
    debugLabel: 'A',
    makeDefaultSwissnumTable: () => testObjectTable,
  });

  // Create a SturdyRef to our own location
  const sturdyRef = clientA.makeSturdyRef(
    locationA,
    encodeSwissnum('test-object'),
  );

  // Verify it's a SturdyRef
  t.true(isSturdyRef(sturdyRef), 'sturdyRef is a SturdyRef');

  // Enliven the self-referential SturdyRef
  const enlivened = await clientA.enlivenSturdyRef(sturdyRef);

  // Verify the enlivened value is NOT a SturdyRef
  t.false(isSturdyRef(enlivened), 'enlivened value is not a SturdyRef');

  // Verify the enlivened value works
  const value = await E(enlivened).getValue();
  t.is(value, 42, 'enlivened value from self-location works correctly');

  clientA.shutdown();
});
