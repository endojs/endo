// @ts-check

/**
 * @import { Client } from '../src/client/types.js'
 * @import { OcapnLocation } from '../src/codecs/components.js'
 */

import test from '@endo/ses-ava/test.js';
import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';
import { isPromise } from '@endo/promise-kit';
import { makeTcpNetLayer } from '../src/netlayers/tcp-test-only.js';
import { makeClient } from '../src/client/index.js';
import { testWithErrorUnwrapping } from './_util.js';
import { encodeSwissnum } from '../src/client/util.js';

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

const makeTestClientPair = async makeDefaultSwissnumTable => {
  const { client: clientA } = await makeTestClient(
    'A',
    makeDefaultSwissnumTable,
  );
  const { client: clientB, location: locationB } = await makeTestClient(
    'B',
    makeDefaultSwissnumTable,
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
