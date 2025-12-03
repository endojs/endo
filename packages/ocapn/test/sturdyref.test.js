// @ts-check

/**
 * @import { Client } from '../src/client/types.js'
 * @import { OcapnLocation } from '../src/codecs/components.js'
 */

import test from '@endo/ses-ava/test.js';
import { E } from '@endo/eventual-send';
import { testWithErrorUnwrapping } from './_util.js';
import { makeTcpNetLayer } from '../src/netlayers/tcp-test-only.js';
import { makeClient } from '../src/client/index.js';
import { OcapnFar } from '../src/client/ocapn.js';
import { encodeSwissnum } from '../src/client/util.js';
import { isSturdyRef, getSturdyRefDetails } from '../src/client/sturdyrefs.js';

/**
 * @param {string} debugLabel
 * @param {() => Map<string, any>} [makeDefaultSwissnumTable]
 * @returns {Promise<{ client: Client, location: OcapnLocation }>}
 */
const makeTestClient = async (debugLabel, makeDefaultSwissnumTable) => {
  const client = makeClient({
    debugLabel,
    swissnumTable: makeDefaultSwissnumTable && makeDefaultSwissnumTable(),
  });
  const tcpNetlayer = await makeTcpNetLayer({ client });
  client.registerNetlayer(tcpNetlayer);
  const { location } = tcpNetlayer;
  return { client, location };
};

testWithErrorUnwrapping('SturdyRef has .enliven() method only', async t => {
  const { client: clientA, location: locationB } = await makeTestClient('A');
  const { client: clientB } = await makeTestClient('B');

  const sturdyRef = clientA.makeSturdyRef(
    locationB,
    encodeSwissnum('test-object'),
  );

  t.is(typeof sturdyRef.enliven, 'function', 'has enliven method');
  // SturdyRef is a class instance, so Object.keys returns 0 (methods are on prototype)
  t.is(Object.keys(sturdyRef).length, 0, 'no enumerable properties');

  clientA.shutdown();
  clientB.shutdown();
});

testWithErrorUnwrapping(
  "SturdyRef doesn't expose swissnum/location",
  async t => {
    const { client: clientA, location: locationB } = await makeTestClient('A');
    const { client: clientB } = await makeTestClient('B');

    const swissNum = encodeSwissnum('test-object');
    const sturdyRef = clientA.makeSturdyRef(locationB, swissNum);

    // Check that the object doesn't expose internals
    t.false('location' in sturdyRef, 'no location property');
    t.false('swissNum' in sturdyRef, 'no swissNum property');
    t.false('swissnum' in sturdyRef, 'no swissnum property');

    // Check stringification doesn't leak internals
    const stringified = String(sturdyRef);
    t.is(
      stringified,
      '[object Object]',
      'stringification is default object string',
    );

    clientA.shutdown();
    clientB.shutdown();
  },
);

testWithErrorUnwrapping(
  'isSturdyRef correctly identifies SturdyRefs',
  async t => {
    const { client: clientA, location: locationB } = await makeTestClient('A');
    const { client: clientB } = await makeTestClient('B');

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
    const { client: clientA, location: locationB } = await makeTestClient('A');
    const { client: clientB } = await makeTestClient('B');

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

test('SturdyRef.enliven() returns promise for fetched value', async t => {
  const testObjectTable = new Map();
  const testObject = OcapnFar('TestObject', {
    getValue: () => 42,
  });
  testObjectTable.set('test-object', testObject);

  const { client: clientA } = await makeTestClient('A');
  const { client: clientB, location: locationB } = await makeTestClient(
    'B',
    () => testObjectTable,
  );

  const sturdyRef = clientA.makeSturdyRef(
    locationB,
    encodeSwissnum('test-object'),
  );

  const enlivenResult = sturdyRef.enliven();
  t.truthy(enlivenResult, 'enliven returns something');
  t.truthy(enlivenResult instanceof Promise, 'enliven returns a promise');

  const resolved = await enlivenResult;
  const value = await E(resolved).getValue();
  t.is(value, 42, 'fetched value works correctly');

  clientA.shutdown();
  clientB.shutdown();
});

test('Enlivened values are not SturdyRefs', async t => {
  const testObjectTable = new Map();
  const testObject = OcapnFar('TestObject', {
    getValue: () => 42,
  });
  testObjectTable.set('test-object', testObject);

  const { client: clientA } = await makeTestClient('A');
  const { client: clientB, location: locationB } = await makeTestClient(
    'B',
    () => testObjectTable,
  );

  const sturdyRef = clientA.makeSturdyRef(
    locationB,
    encodeSwissnum('test-object'),
  );

  // Verify sturdyRef is a SturdyRef before enliven
  t.true(isSturdyRef(sturdyRef), 'sturdyRef is a SturdyRef before enliven');

  // Enliven the sturdyref
  const enlivened = await sturdyRef.enliven();

  // Verify the enlivened value is NOT a SturdyRef
  t.false(isSturdyRef(enlivened), 'enlivened value is not a SturdyRef');

  // Verify the enlivened value works
  const value = await E(enlivened).getValue();
  t.is(value, 42, 'enlivened value works correctly');

  clientA.shutdown();
  clientB.shutdown();
});
