// @ts-check
/* global setTimeout */

/** @typedef {import('@endo/ses-ava/prepare-endo.js').default} Test */

/**
 * @import { Client, Connection, LocationId, Session } from '../src/client/types.js'
 * @import { OcapnLocation } from '../src/codecs/components.js'
 * @import { TcpTestOnlyNetLayer } from '../src/netlayers/tcp-test-only.js'
 */

import test from '@endo/ses-ava/test.js';
import { makeTcpNetLayer } from '../src/netlayers/tcp-test-only.js';
import { makeClient } from '../src/client/index.js';
import { locationToLocationId } from '../src/client/util.js';

const strictTextDecoder = new TextDecoder('utf-8', { fatal: true });

/**
 * @param {Test} t
 * @param {() => void} fn
 * @param {object} errorShape
 * @returns {void}
 * Like t.throws, but with a more flexible error shape (allows error.cause)
 */
export const throws = (t, fn, errorShape) => {
  try {
    fn();
  } catch (error) {
    t.like(error, errorShape);
    return;
  }
  t.fail('Expected error');
};

/**
 * @param {Uint8Array} bytes
 * @returns {{isValidUtf8: boolean, value: string | undefined}}
 */
export const maybeDecode = bytes => {
  try {
    return {
      isValidUtf8: true,
      value: strictTextDecoder.decode(bytes),
    };
  } catch (error) {
    return {
      isValidUtf8: false,
      value: undefined,
    };
  }
};

const logErrorCauseChain = (t, error, testName) => {
  const causes = [];
  let current = error;
  while (current) {
    causes.push(current);
    current = current.cause;
  }
  t.log(`Function threw for ${testName}:`);
  for (const [index, cause] of causes.entries()) {
    t.log(`Error chain, depth ${index}:`);
    t.log(cause.stack);
  }
};

/**
 * @param {Test} t
 * @param {() => void} fn
 * @param {string} testName
 * @returns {void}
 */
export const notThrowsWithErrorUnwrapping = (t, fn, testName) => {
  try {
    fn();
  } catch (error) {
    logErrorCauseChain(t, error, testName);
    t.fail(`Function threw. ${error}`);
  }
};

/**
 * @param {Test} t
 * @param {(t: Test) => Promise<void>} asyncFn
 * @param {string} testName
 * @returns {Promise<void>}
 */
export const notThrowsWithErrorUnwrappingAsync = async (
  t,
  asyncFn,
  testName,
) => {
  try {
    // eslint-disable-next-line @jessie.js/safe-await-separator
    await asyncFn(t);
  } catch (error) {
    logErrorCauseChain(t, error, testName);
    t.fail(`Function threw. ${error}`);
  }
};

export const testWithErrorUnwrapping = (testName, fn) => {
  return test(testName, t => {
    return notThrowsWithErrorUnwrappingAsync(t, fn, testName);
  });
};
testWithErrorUnwrapping.only = (testName, fn) => {
  return test.only(testName, t => {
    return notThrowsWithErrorUnwrappingAsync(t, fn, testName);
  });
};

/**
 * @param {() => (boolean | Promise<boolean>)} fn
 * @param {number} timeoutMs
 * @param {number} delayMs
 * @returns {Promise<void>}
 */
export const waitUntilTrue = async (fn, timeoutMs = 1000, delayMs = 20) => {
  await undefined;
  const endTime = timeoutMs + Date.now();
  while (endTime > Date.now()) {
    // eslint-disable-next-line no-await-in-loop
    if (await fn()) {
      return;
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise(resolve => {
      setTimeout(resolve, delayMs);
    });
  }
  throw new Error('waitUntilTrue timed out');
};

/**
 * @typedef {object} ClientKit
 * @property {Client} client
 * @property {TcpTestOnlyNetLayer} netlayer
 * @property {OcapnLocation} location
 * @property {LocationId} locationId
 */

/**
 * @param {object} options
 * @param {string} options.debugLabel
 * @param {() => Map<string, any>} [options.makeDefaultSwissnumTable]
 * @param {boolean} [options.verbose]
 * @param {object} [options.clientOptions]
 * @returns {Promise<ClientKit>}
 */
export const makeTestClient = async ({
  debugLabel,
  makeDefaultSwissnumTable,
  verbose,
  clientOptions,
}) => {
  const client = makeClient({
    debugLabel,
    swissnumTable: makeDefaultSwissnumTable && makeDefaultSwissnumTable(),
    verbose,
    ...clientOptions,
  });
  const netlayer = await makeTcpNetLayer({
    client,
    specifiedDesignator: debugLabel,
  });
  client.registerNetlayer(netlayer);
  const { location } = netlayer;
  const locationId = locationToLocationId(location);
  return { client, netlayer, location, locationId };
};

/**
 * @param {object} [options]
 * @param {() => Map<string, any>} [options.makeDefaultSwissnumTable]
 * @param {boolean} [options.verbose]
 * @param {object} [options.clientAOptions]
 * @param {object} [options.clientBOptions]
 * @returns {Promise<{
 *   clientKitA: ClientKit,
 *   clientKitB: ClientKit,
 *   establishSession: () => Promise<{ sessionA: Session, sessionB: Session }>,
 *   shutdownBoth: () => void,
 *   getConnectionAtoB: () => Connection | undefined,
 *   getConnectionBtoA: () => Connection | undefined,
 * }>}
 */
export const makeTestClientPair = async ({
  makeDefaultSwissnumTable,
  verbose,
  clientAOptions,
  clientBOptions,
} = {}) => {
  const clientKitA = await makeTestClient({
    debugLabel: 'A',
    makeDefaultSwissnumTable,
    verbose,
    clientOptions: clientAOptions,
  });
  const clientKitB = await makeTestClient({
    debugLabel: 'B',
    makeDefaultSwissnumTable,
    verbose,
    clientOptions: clientBOptions,
  });
  const shutdownBoth = () => {
    clientKitA.client.shutdown();
    clientKitB.client.shutdown();
  };

  const establishSession = async () => {
    const sessionA = await clientKitA.client.provideSession(
      clientKitB.location,
    );
    const sessionB = await clientKitB.client.provideSession(
      clientKitA.location,
    );
    return { sessionA, sessionB };
  };

  const getConnectionAtoB = () => {
    return clientKitA.client.sessionManager.getActiveSession(
      clientKitB.locationId,
    )?.connection;
  };
  const getConnectionBtoA = () => {
    return clientKitB.client.sessionManager.getActiveSession(
      clientKitA.locationId,
    )?.connection;
  };

  return {
    clientKitA,
    clientKitB,
    establishSession,
    shutdownBoth,
    getConnectionAtoB,
    getConnectionBtoA,
  };
};
