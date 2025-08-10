// @ts-check

/** @typedef {import('../src/codecs/components.js').OcapnLocation} OcapnLocation */
/** @typedef {import('../src/client/types.js').Client} Client */
/** @typedef {import('../src/client/types.js').MarshalPlugin} MarshalPlugin */

import test from '@endo/ses-ava/prepare-endo.js';
import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';
import { isPromise } from '@endo/promise-kit';
import { makeTcpNetLayer } from '../src/netlayers/tcp-test-only.js';
import { makeClient } from '../src/client/index.js';
import { testWithErrorUnwrapping } from './_util.js';
import { encodeSwissnum } from '../src/client/util.js';
import { makeTagged, passStyleOf } from '../src/pass-style-helpers.js';

/**
 * @param {string} debugLabel
 * @param {() => Map<string, any>} [makeDefaultSwissnumTable]
 * @param {MarshalPlugin[]} [marshalPlugins]
 * @returns {Promise<{ client: Client, location: OcapnLocation }>}
 */
const makeTestClient = async (
  debugLabel,
  makeDefaultSwissnumTable,
  marshalPlugins,
) => {
  const client = makeClient({
    debugLabel,
    swissnumTable: makeDefaultSwissnumTable && makeDefaultSwissnumTable(),
    marshalPlugins,
  });
  const tcpNetlayer = await makeTcpNetLayer({ client });
  client.registerNetlayer(tcpNetlayer);
  const { location } = tcpNetlayer;
  return { client, location };
};

/**
 * @param {() => Map<string, any>} makeDefaultSwissnumTable
 * @param {MarshalPlugin[]} [marshalPlugins]
 * @returns {Promise<{ clientA: Client, clientB: Client, locationB: OcapnLocation, shutdownBoth: () => void, ocapnA: Ocapn, bootstrapB: any }>}
 */
const makeTestClientPair = async (makeDefaultSwissnumTable, marshalPlugins) => {
  const { client: clientA } = await makeTestClient(
    'A',
    makeDefaultSwissnumTable,
    marshalPlugins,
  );
  const { client: clientB, location: locationB } = await makeTestClient(
    'B',
    makeDefaultSwissnumTable,
    marshalPlugins,
  );
  const shutdownBoth = () => {
    clientA.shutdown();
    clientB.shutdown();
  };
  const { ocapn: ocapnA } = await clientA.provideSession(locationB);
  const bootstrapB = await ocapnA.getBootstrap();
  return { clientA, clientB, locationB, shutdownBoth, ocapnA, bootstrapB };
};

test('test slow send', async t => {
  const testObjectTable = new Map();
  testObjectTable.set(
    'Say Hello',
    Far('sayHello', name => {
      return `Hello ${name}`;
    }),
  );

  const { bootstrapB: bootstrap, shutdownBoth } = await makeTestClientPair(
    () => testObjectTable,
  );

  const helloer = await E(bootstrap).fetch(encodeSwissnum('Say Hello'));
  const result = await E(helloer)('Wuurl');
  t.is(result, 'Hello Wuurl');

  shutdownBoth();
});

test('basic eventual send', async t => {
  const testObjectTable = new Map();
  testObjectTable.set(
    'Say Hello',
    Far('sayHello', name => {
      return `Hello ${name}`;
    }),
  );

  const { bootstrapB: bootstrap, shutdownBoth } = await makeTestClientPair(
    () => testObjectTable,
  );

  const helloer = E(bootstrap).fetch(encodeSwissnum('Say Hello'));
  const result = await E(helloer)('Wuurl');

  t.is(result, 'Hello Wuurl');

  shutdownBoth();
});

testWithErrorUnwrapping(
  'exported promises dont conflict with answer position',
  async t => {
    const testObjectTable = new Map();
    testObjectTable.set(
      'Get Promises',
      Far('getPromises', () => {
        // return a bunch of promises to populate the local export table
        return [
          Promise.resolve('Why'),
          Promise.resolve('Hello'),
          Promise.resolve('There'),
        ];
      }),
    );
    testObjectTable.set(
      'Deep Number',
      Far('getNumberGetter', () => {
        return Far('getNumber', () => 42);
      }),
    );

    const { bootstrapB: bootstrap, shutdownBoth } = await makeTestClientPair(
      () => testObjectTable,
    );

    const getPromises = E(bootstrap).fetch(encodeSwissnum('Get Promises'));
    const promises = await E(getPromises)();

    // Do some promise pipelining so that incorrectly implemented answerPositions
    // could conflict with exported promises
    const getNumberGetter = E(bootstrap).fetch(encodeSwissnum('Deep Number'));
    const numberGetter = E(getNumberGetter)();
    const number = await E(numberGetter)();
    t.is(number, 42, 'Number is 42');

    // Sanity check
    t.truthy(
      promises.every(p => isPromise(p)),
      'All promises',
    );
    const results = await Promise.all(promises);
    t.deepEqual(results, ['Why', 'Hello', 'There'], 'All promises resolved');

    shutdownBoth();
  },
);

test('marshal plugins roundtrip', async t => {
  class Greeble {
    constructor(id) {
      this.id = id;
    }
  }

  const testObjectTable = new Map();
  testObjectTable.set(
    'GreebleMaker',
    Far('makeGreeble', id => {
      return new Greeble(id);
    }),
  );

  const GreeblePlugin = {
    encode: value => {
      if (value instanceof Greeble) {
        return makeTagged('Greeble', value.id);
      }
      return undefined;
    },
    decode: value => {
      if (
        passStyleOf(value) === 'tagged' &&
        value[Symbol.toStringTag] === 'Greeble'
      ) {
        return new Greeble(value.payload);
      }
      return undefined;
    },
  };

  const { bootstrapB: bootstrap, shutdownBoth } = await makeTestClientPair(
    () => testObjectTable,
    [GreeblePlugin],
  );

  const makeGreeble = E(bootstrap).fetch(encodeSwissnum('GreebleMaker'));
  const greeble = await E(makeGreeble)(123n);

  // Sanity check
  t.is(greeble.id, 123n, 'Greeble id is 123');
  t.truthy(greeble instanceof Greeble, 'Greeble is a Greeble');

  shutdownBoth();
});
