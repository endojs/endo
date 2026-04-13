/* global setTimeout */
import net from 'net';
import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';
import testBase from '@endo/ses-ava/prepare-endo.js';

import {
  encodeSwissnum,
  locationToLocationId,
  makeClient,
  makeTcpNetLayer,
  parseSlot,
} from '@endo/ocapn';
import { makeDurableClient, makeInMemoryDurableBaggage } from '../index.js';
import { netListenAllowed } from './_net-permission.js';

const test = netListenAllowed ? testBase : testBase.skip;

/**
 * @returns {Promise<number>}
 */
const getFreePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address !== 'object') {
        reject(Error('expected server address object'));
        return;
      }
      const { port } = address;
      server.close(err => {
        if (err) {
          reject(err);
          return;
        }
        resolve(port);
      });
    });
  });

/**
 * @param {() => boolean | Promise<boolean>} fn
 * @param {number} [timeoutMs]
 * @param {number} [delayMs]
 * @returns {Promise<void>}
 */
const waitUntilTrue = async (fn, timeoutMs = 1000, delayMs = 20) => {
  await undefined;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    if (await fn()) {
      return;
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  throw Error('waitUntilTrue timed out');
};

/**
 * @param {object} options
 * @param {(clientOptions: object) => any} options.makeClientFn
 * @param {object} options.clientOptions
 * @param {object} options.netlayerOptions
 * @returns {Promise<{
 *   client: any,
 *   debug: any,
 *   netlayer: any,
 *   location: any,
 *   locationId: string,
 *   shutdown: () => void,
 * }>}
 */
const makeClientKit = async ({ makeClientFn, clientOptions, netlayerOptions }) => {
  const client = makeClientFn({
    debugMode: true,
    ...clientOptions,
  });
  // eslint-disable-next-line no-underscore-dangle
  if (!client._debug) {
    throw Error('debug object required for restart tests');
  }
  // eslint-disable-next-line no-underscore-dangle
  const debug = client._debug;
  const netlayer = await client.registerNetlayer((handlers, logger) => {
    return makeTcpNetLayer({
      handlers,
      logger,
      ...netlayerOptions,
    });
  });
  return {
    client,
    debug,
    netlayer,
    location: netlayer.location,
    locationId: locationToLocationId(netlayer.location),
    shutdown: () => client.shutdown(),
  };
};

test('durable client preserves export/import slot positions across restart', async t => {
  const durableBaggage = makeInMemoryDurableBaggage();
  const durableSwissOne = encodeSwissnum('durable-one');
  const durableSwissTwo = encodeSwissnum('durable-two');
  const stablePort = await getFreePort();

  const durableObjectOne = Far('DurableOne', {
    getValue: () => 1,
  });
  const durableObjectTwo = Far('DurableTwo', {
    getValue: () => 2,
  });

  const clientKitB = await makeClientKit({
    makeClientFn: makeClient,
    clientOptions: {
      debugLabel: 'durable-peer-b',
    },
    netlayerOptions: {
      specifiedDesignator: 'durable-peer-b',
    },
  });

  const clientKitA1 = await makeClientKit({
    makeClientFn: makeDurableClient,
    clientOptions: {
      debugLabel: 'durable-peer-a',
      baggage: durableBaggage,
    },
    netlayerOptions: {
      specifiedDesignator: 'durable-peer-a',
      specifiedPort: stablePort,
    },
  });

  try {
    clientKitA1.client.registerSturdyRef('durable-one', durableObjectOne);

    const sturdyRefOne = clientKitB.client.makeSturdyRef(
      clientKitA1.location,
      durableSwissOne,
    );
    const resolvedBeforeRestart = await clientKitB.client.enlivenSturdyRef(
      sturdyRefOne,
    );
    t.is(await E(resolvedBeforeRestart).getValue(), 1);

    const sessionA1ToB = await clientKitA1.debug.provideInternalSession(
      clientKitB.location,
    );
    const sessionBToA1 = await clientKitB.debug.provideInternalSession(
      clientKitA1.location,
    );
    // eslint-disable-next-line no-underscore-dangle
    const slotA1 = sessionA1ToB.ocapn._debug.ocapnTable.getSlotForValue(
      durableObjectOne,
    );
    // eslint-disable-next-line no-underscore-dangle
    const slotB1 = sessionBToA1.ocapn._debug.ocapnTable.getSlotForValue(
      resolvedBeforeRestart,
    );
    t.truthy(slotA1);
    t.truthy(slotB1);

    const sessionForB = await clientKitB.client.provideSession(clientKitA1.location);
    sessionForB.abort();
    await waitUntilTrue(
      () =>
        clientKitB.debug.sessionManager.getActiveSession(clientKitA1.locationId) ===
        undefined,
    );
    await waitUntilTrue(
      () =>
        clientKitA1.debug.sessionManager.getActiveSession(clientKitB.locationId) ===
        undefined,
    );

    clientKitA1.shutdown();

    const clientKitA2 = await makeClientKit({
      makeClientFn: makeDurableClient,
      clientOptions: {
        debugLabel: 'durable-peer-a',
        baggage: durableBaggage,
      },
      netlayerOptions: {
        specifiedDesignator: 'durable-peer-a',
        specifiedPort: stablePort,
      },
    });

    try {
      const resolvedAfterRestart = await clientKitB.client.enlivenSturdyRef(
        sturdyRefOne,
      );
      t.is(await E(resolvedAfterRestart).getValue(), 1);

      const sessionA2ToB = await clientKitA2.debug.provideInternalSession(
        clientKitB.location,
      );
      const sessionBToA2 = await clientKitB.debug.provideInternalSession(
        clientKitA2.location,
      );
      // eslint-disable-next-line no-underscore-dangle
      const slotA2 = sessionA2ToB.ocapn._debug.ocapnTable.getSlotForValue(
        durableObjectOne,
      );
      // eslint-disable-next-line no-underscore-dangle
      const slotB2 = sessionBToA2.ocapn._debug.ocapnTable.getSlotForValue(
        resolvedAfterRestart,
      );
      t.is(slotA2, slotA1);
      t.is(slotB2, slotB1);
      if (slotA2 && slotB2) {
        t.is(parseSlot(slotA2).position, parseSlot(slotB2).position);
      }

      clientKitA2.client.registerSturdyRef('durable-two', durableObjectTwo);
      const sturdyRefTwo = clientKitB.client.makeSturdyRef(
        clientKitA2.location,
        durableSwissTwo,
      );
      const resolvedSecond = await clientKitB.client.enlivenSturdyRef(
        sturdyRefTwo,
      );
      t.is(await E(resolvedSecond).getValue(), 2);

      // eslint-disable-next-line no-underscore-dangle
      const slotA2Second = sessionA2ToB.ocapn._debug.ocapnTable.getSlotForValue(
        durableObjectTwo,
      );
      t.truthy(slotA2Second);
      if (slotA2 && slotA2Second) {
        t.true(
          parseSlot(slotA2Second).position > parseSlot(slotA2).position,
          'new export should allocate a higher slot position after restored slots',
        );
      }
    } finally {
      clientKitA2.shutdown();
    }
  } finally {
    clientKitB.shutdown();
  }
});
