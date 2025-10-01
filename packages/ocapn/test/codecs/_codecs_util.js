// @ts-check

/**
 * @import { CapTPEngine } from '../../src/captp/captp-engine.js'
 * @import { MakeHandoff, MakeRemoteResolver, MakeRemoteSturdyRef, TableKit } from '../../src/client/ocapn.js'
 * @import { OcapnLocation } from '../../src/codecs/components.js'
 * @import { HandoffGiveSigEnvelope, HandoffReceiveSigEnvelope } from '../../src/codecs/descriptors.js'
 * @import { SyrupCodec } from '../../src/syrup/codec.js'
 * @import { Settler } from '@endo/eventual-send'
 */

import { Buffer } from 'buffer';
import { Far, Remotable } from '@endo/marshal';
import { HandledPromise } from '@endo/eventual-send';
import { makeCapTPEngine } from '../../src/captp/captp-engine.js';
import {
  makeGrantDetails,
  makeGrantTracker,
  makeTableKit,
  OcapnFar,
} from '../../src/client/ocapn.js';
import { makeDescCodecs } from '../../src/codecs/descriptors.js';
import { makePassableCodecs } from '../../src/codecs/passable.js';
import { makeOcapnOperationsCodecs } from '../../src/codecs/operations.js';
import { makeSyrupReader } from '../../src/syrup/decode.js';
import { makeSyrupWriter } from '../../src/syrup/encode.js';
import { maybeDecode, notThrowsWithErrorUnwrapping } from '../_util.js';

const textEncoder = new TextEncoder();
const sloppyTextDecoder = new TextDecoder('utf-8', { fatal: false });

const bufferToHex = uint8Array => {
  return Buffer.from(uint8Array).toString('hex');
};

/** @type {OcapnLocation} */
const defaultPeerLocation = {
  type: 'ocapn-node',
  transport: 'tcp-test-only',
  address: '127.0.0.1:54822',
  hints: false,
};

/**
 * @typedef {object} CodecTestKit
 * @property {CapTPEngine} engine
 * @property {TableKit} tableKit
 * @property {(position: bigint) => any} makeExportAt
 * @property {(position: bigint) => Promise<any>} makeAnswerAt
 * @property {(signedGive: HandoffGiveSigEnvelope) => Promise<any>} lookupHandoff
 * @property {(location: OcapnLocation, swissNum: Uint8Array) => Promise<any>} lookupSturdyRef
 * @property {SyrupCodec} ReferenceCodec
 * @property {SyrupCodec} DescImportObjectCodec
 * @property {SyrupCodec} OcapnMessageUnionCodec
 * @property {SyrupCodec} PassableCodec
 */

/**
 * @param {OcapnLocation} [peerLocation]
 * @returns {CodecTestKit}
 */
export const makeCodecTestKit = (peerLocation = defaultPeerLocation) => {
  const verbose = false;
  const logger = harden({
    log: (...args) => console.log(...args),
    error: (...args) => console.error(...args),
    info: (...args) => verbose && console.info(...args),
  });

  const makeRemoteKit = (targetSlot, mode = 'deliver') => {
    const handler = {
      get(_o, prop) {
        throw Error('OCapN GET: Not implemented for test');
      },
      applyFunction(_o, args) {
        throw Error('OCapN APPLY FUNCTION: Not implemented for test');
      },
      applyMethod(_o, prop, args) {
        throw Error('OCapN APPLY METHOD: Not implemented for test');
      },
    };
    /** @type {Settler | undefined} */
    let settler;
    /** @type {import('@endo/eventual-send').HandledExecutor} */
    const executor = (resolve, reject, resolveWithPresence) => {
      settler = Far('settler', {
        resolve,
        reject,
        resolveWithPresence: () => resolveWithPresence(handler),
      });
    };
    const promise = new HandledPromise(executor, handler);
    assert(settler);
    return harden({ promise, settler });
  };

  /**
   * @type {MakeRemoteResolver}
   */
  const makeRemoteResolver = slot => {
    const { settler } = makeRemoteKit(slot, 'deliver-only');
    const resolver = Remotable(
      'Alleged: resolver',
      undefined,
      settler.resolveWithPresence(),
    );
    // eslint-disable-next-line no-use-before-define
    engine.registerImport(resolver, slot);
    return resolver;
  };

  const testSturdyRefMap = new Map();
  const testHandoffMap = new Map();

  /**
   * @param {OcapnLocation} location
   * @param {Uint8Array} swissNum
   * @returns {string}
   */
  const getSturdyRefKey = (location, swissNum) => {
    return `${location.transport}:${location.address}:${bufferToHex(swissNum)}`;
  };

  /**
   * @param {OcapnLocation} location
   * @param {Uint8Array} swissNum
   * @returns {Promise<any>}
   */
  const lookupSturdyRef = (location, swissNum) => {
    const testKey = getSturdyRefKey(location, swissNum);
    return testSturdyRefMap.get(testKey);
  };

  /**
   * @param {HandoffGiveSigEnvelope} signedGive
   * @returns {Promise<any>}
   */
  const lookupHandoff = signedGive => {
    const { object: handoffGive } = signedGive;
    const {
      giftId,
      receiverKey: { q: receiverPubKeyBytes },
      exporterSessionId,
    } = handoffGive;
    const testKey = `${giftId}:${bufferToHex(receiverPubKeyBytes)}:${bufferToHex(exporterSessionId)}`;
    return testHandoffMap.get(testKey);
  };

  /**
   * @type {MakeRemoteSturdyRef}
   */
  const makeRemoteSturdyRef = (location, swissNum) => {
    const promise = new Promise(() => {});
    const testKey = getSturdyRefKey(location, swissNum);
    testSturdyRefMap.set(testKey, promise);
    return promise;
  };

  /**
   * @type {MakeHandoff}
   */
  const makeHandoff = signedGive => {
    const promise = new Promise(() => {});
    const { object: handoffGive } = signedGive;
    const {
      giftId,
      receiverKey: { q: receiverPubKeyBytes },
      exporterSessionId,
    } = handoffGive;
    const testKey = `${giftId}:${bufferToHex(receiverPubKeyBytes)}:${bufferToHex(exporterSessionId)}`;
    testHandoffMap.set(testKey, promise);
    return promise;
  };

  const grantTracker = makeGrantTracker();

  const importHook = (val, slot) => {
    const grantDetails = makeGrantDetails(peerLocation, slot);
    grantTracker.recordImport(val, grantDetails);
  };

  const engine = makeCapTPEngine('test', logger, makeRemoteKit, {
    importHook,
  });

  const getActiveSession = () => {
    throw Error('getActiveSession is not implemented for test');
  };

  const sendDepositGift = () => {
    throw Error('sendDepositGift is not implemented for test');
  };

  const tableKit = makeTableKit(
    peerLocation,
    engine,
    makeRemoteResolver,
    makeRemoteSturdyRef,
    makeHandoff,
    grantTracker,
    getActiveSession,
    sendDepositGift,
  );
  const descCodecs = makeDescCodecs(tableKit);
  const passableCodecs = makePassableCodecs(descCodecs);
  const { OcapnMessageUnionCodec } = makeOcapnOperationsCodecs(
    descCodecs,
    passableCodecs,
  );
  const { PassableCodec } = passableCodecs;

  const makeExportAt = position => {
    const slot = `o+${position}`;
    const value = OcapnFar('Export', {});
    engine.registerExport(value, slot);
    return value;
  };

  const makeAnswerAt = position => {
    const slot = `q-${position}`;
    const promise = Promise.resolve('answer');
    engine.resolveAnswer(slot, promise);
    return promise;
  };

  return {
    engine,
    tableKit,
    makeExportAt,
    makeAnswerAt,
    lookupHandoff,
    lookupSturdyRef,
    ...descCodecs,
    OcapnMessageUnionCodec,
    PassableCodec,
  };
};

const getSyrupBytes = syrup => {
  return typeof syrup === 'string' ? textEncoder.encode(syrup) : syrup;
};

const getSyrupString = syrup => {
  // This text decoder is only for testing label purposes, so it doesn't need to be strict.
  return typeof syrup === 'string' ? syrup : sloppyTextDecoder.decode(syrup);
};

/**
 * @typedef {object} CodecTestEntry
 * @property {SyrupCodec} [codec]
 * @property {(testKit: CodecTestKit) => SyrupCodec} [getCodec]
 * @property {string | Uint8Array} syrup
 * @property {(testKit: CodecTestKit) => void} [beforeTest]
 * @property {any} [value]
 * @property {(testKit: CodecTestKit) => any} [makeValue]
 * @property {(testKit: CodecTestKit) => any} [makeValueAfter]
 * @property {string | Uint8Array} [returnSyrup]
 * @property {boolean} [skipWrite]
 * @property {string} [name]
 */

/**
 * @param {any} t
 * @param {CodecTestEntry} testEntry
 */
export const testBidirectionally = (
  t,
  {
    codec: specifiedCodec,
    getCodec,
    beforeTest,
    value,
    makeValue,
    makeValueAfter,
    syrup,
    returnSyrup: expectedOutputSyrup = syrup,
    skipWrite = false,
    name = '(unknown test entry)',
  },
) => {
  const inputSyrupString = getSyrupString(syrup);
  const testDescriptor = `${name} ${inputSyrupString}`;
  if (
    [value, makeValue, makeValueAfter].filter(arg => arg !== undefined).length >
    1
  ) {
    throw Error(
      `Only one of value, makeValue, or makeValueAfter can be provided for ${name}`,
    );
  }
  const testKit = makeCodecTestKit();
  const codec = specifiedCodec || (getCodec && getCodec(testKit));
  if (!codec) {
    throw Error(`codec or getCodec must be provided for ${name}`);
  }

  if (beforeTest) {
    beforeTest(testKit);
  }

  let expectedValue = value;
  if (makeValue) {
    expectedValue = makeValue(testKit);
  }
  // Test read.
  const inputSyrupBytes = getSyrupBytes(syrup);
  const syrupReader = makeSyrupReader(inputSyrupBytes, {
    name: `${name} ${inputSyrupString}`,
  });
  let actualValueResult;
  notThrowsWithErrorUnwrapping(
    t,
    () => {
      actualValueResult = codec.read(syrupReader);
    },
    `read syrup: ${testDescriptor}`,
  );
  if (makeValueAfter) {
    expectedValue = makeValueAfter(testKit);
  }
  t.deepEqual(
    actualValueResult,
    expectedValue,
    `value check: ${testDescriptor}`,
  );

  // If we're skipping the return, we're done.
  if (skipWrite) {
    return;
  }

  // Test write.
  const expectedOutputSyrupString = getSyrupString(expectedOutputSyrup);
  const expectedOutputSyrupBytes = getSyrupBytes(expectedOutputSyrup);
  const syrupWriter = makeSyrupWriter();
  notThrowsWithErrorUnwrapping(
    t,
    () => {
      codec.write(expectedValue, syrupWriter);
    },
    `write syrup: ${testDescriptor}`,
  );
  const actualSyrupResultBytes = syrupWriter.getBytes();
  const { value: actualSyrupResultString, isValidUtf8 } = maybeDecode(
    actualSyrupResultBytes,
  );
  // We only match the syrup strings for easier debugging,
  // and we can only do this if the syrup is valid UTF-8.
  if (isValidUtf8) {
    t.deepEqual(
      actualSyrupResultString,
      expectedOutputSyrupString,
      `write syrup: ${testDescriptor}`,
    );
  }
  // Testing the bytes is what we actually care about.
  t.deepEqual(
    actualSyrupResultBytes,
    expectedOutputSyrupBytes,
    `write syrup: ${testDescriptor}`,
  );
};
