// @ts-check
/* global setTimeout */

/** @typedef {import('@endo/ses-ava/prepare-endo.js').default} Test */

/**
 * @import { Client, Connection, LocationId, Session } from '../src/client/types.js'
 * @import { OcapnLocation } from '../src/codecs/components.js'
 * @import { TcpTestOnlyNetLayer } from '../src/netlayers/tcp-test-only.js'
 * @import { Ocapn, OcapnDebug } from '../src/client/ocapn.js'
 */

import test from '@endo/ses-ava/test.js';
import { makeTcpNetLayer } from '../src/netlayers/tcp-test-only.js';
import { makeClient } from '../src/client/index.js';
import { locationToLocationId } from '../src/client/util.js';

const strictTextDecoder = new TextDecoder('utf-8', { fatal: true });

/**
 * Get the debug object from an Ocapn instance, asserting it is present.
 * Requires the client to have been created with `debugMode: true`.
 * @param {Ocapn} ocapn
 * @returns {OcapnDebug}
 */
export const getOcapnDebug = ocapn => {
  assert(
    // eslint-disable-next-line no-underscore-dangle
    ocapn._debug,
    'debug object not available - client must be created with debugMode: true',
  );
  // eslint-disable-next-line no-underscore-dangle
  return ocapn._debug;
};

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
    t.log(cause);
    if (cause.stack) t.log(cause.stack);
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
 * @param {number} [options.writeLatencyMs] - Optional artificial latency for writes (ms)
 * @returns {Promise<ClientKit>}
 */
export const makeTestClient = async ({
  debugLabel,
  makeDefaultSwissnumTable,
  verbose,
  clientOptions,
  writeLatencyMs,
}) => {
  const client = makeClient({
    debugLabel,
    swissnumTable: makeDefaultSwissnumTable && makeDefaultSwissnumTable(),
    verbose,
    debugMode: true,
    ...clientOptions,
  });
  const netlayer = await makeTcpNetLayer({
    client,
    specifiedDesignator: debugLabel,
    writeLatencyMs,
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

/**
 * Note: This helper is used in to manually serialize an op:untag message,
 * unil an E.untag and corresponding HandledPromise handler method is implemented.
 * When available, this utility should be removed.
 *
 * Creates a helper for sending raw op:untag messages for testing.
 * Uses the internal send function which goes through the same path as
 * the handler's message sending.
 *
 * This helper sends both op:deliver (to call a method that returns a tagged value)
 * and op:untag (to extract the payload) in sequence, enabling true pipelining tests.
 *
 * @param {Session} senderSession - The session that will send the messages
 * @returns {object} Helper object with callAndUntag method
 */
export const makeUntagTestHelper = senderSession => {
  const { ocapn } = senderSession;
  const { referenceKit } = ocapn;
  const { sendMessage } = getOcapnDebug(ocapn);

  /**
   * Calls a method on a remote object and immediately sends op:untag to extract
   * the payload from the result (which should be a tagged value).
   * This enables true pipelining - op:untag is sent before the call result arrives.
   *
   * @param {unknown} target - The remote object to call (must be a remotable)
   * @param {string|symbol} method - The method name (or symbol for function call)
   * @param {unknown[]} args - Arguments to pass to the method
   * @param {string} expectedTag - The expected tag string
   * @returns {Promise<unknown>} Promise that resolves to the extracted payload
   */
  const callAndUntag = (target, method, args, expectedTag) => {
    // Create answer for the method call result (this is where the tagged value will be)
    const {
      answerPromise: callAnswerPromise,
      position: callAnswerPosition,
      resolver: callResolveMeDesc,
    } = referenceKit.takeNextRemoteAnswer();

    // Create answer for the untag result
    const {
      answerPromise: untagAnswerPromise,
      position: untagAnswerPosition,
      resolver: untagResolveMeDesc,
    } = referenceKit.takeNextRemoteAnswer();

    // Send op:deliver to call the method
    sendMessage({
      type: 'op:deliver',
      to: target,
      args: typeof method === 'symbol' ? args : [Symbol.for(method), ...args],
      answerPosition: callAnswerPosition,
      resolveMeDesc: callResolveMeDesc, // We don't use this but it must be valid
    });

    // Immediately send op:untag referencing the call's answer position
    // The receiver will process this by looking up its local answer at callAnswerPosition
    sendMessage({
      type: 'op:untag',
      receiverDesc: callAnswerPromise, // We are pipelining over the op:deliver answer promise
      tag: expectedTag,
      answerPosition: untagAnswerPosition,
    });

    // Send op:listen so we get the untag result back
    sendMessage({
      type: 'op:listen',
      to: untagAnswerPromise,
      resolveMeDesc: untagResolveMeDesc,
      wantsPartial: false,
    });

    return untagAnswerPromise;
  };

  return harden({ callAndUntag });
};
