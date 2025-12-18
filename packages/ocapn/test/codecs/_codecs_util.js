// @ts-check

/**
 * @import { MakeHandoff } from '../../src/client/ocapn.js'
 * @import { ReferenceKit } from '../../src/client/ref-kit.js'
 * @import { OcapnLocation } from '../../src/codecs/components.js'
 * @import { HandoffGiveSigEnvelope, HandoffReceiveSigEnvelope } from '../../src/codecs/descriptors.js'
 * @import { SyrupCodec } from '../../src/syrup/codec.js'
 * @import { Settler } from '@endo/eventual-send'
 * @import { PublicKeyId, SessionId, SwissNum } from '../../src/client/types.js'
 */

import { Buffer } from 'buffer';
import { Far } from '@endo/marshal';
import { HandledPromise } from '@endo/eventual-send';
import {
  makeGrantTracker,
  makeGrantDetails,
} from '../../src/client/grant-tracker.js';
import { makeReferenceKit } from '../../src/client/ref-kit.js';

import { makeSturdyRefTracker } from '../../src/client/sturdyrefs.js';
import { makeDescCodecs } from '../../src/codecs/descriptors.js';
import { makePassableCodecs } from '../../src/codecs/passable.js';
import { makeOcapnOperationsCodecs } from '../../src/codecs/operations.js';
import { makeSyrupReader } from '../../src/syrup/decode.js';
import { makeSyrupWriter } from '../../src/syrup/encode.js';
import { maybeDecode, notThrowsWithErrorUnwrapping } from '../_util.js';
import {
  makeOcapnKeyPairFromPrivateKey,
  makeSignedHandoffGive,
  makeSignedHandoffReceive,
} from '../../src/cryptography.js';
import { uint8ArrayToImmutableArrayBuffer } from '../../src/buffer-utils.js';
import { makeOcapnTable } from '../../src/captp/ocapn-tables.js';
import { makeSlot } from '../../src/captp/pairwise.js';

const bufferToHex = arrayBuffer => {
  // Convert ImmutableArrayBuffer to regular ArrayBuffer
  const buffer = arrayBuffer.slice();
  return Buffer.from(buffer).toString('hex');
};

/** @type {OcapnLocation} */
export const exporterLocation = harden({
  type: 'ocapn-peer',
  transport: 'tcp-test-only',
  designator: 'exporter',
  hints: { host: '127.0.0.1', port: '54822' },
});
/** @type {OcapnLocation} */
export const receiverLocation = harden({
  type: 'ocapn-peer',
  transport: 'tcp-test-only',
  designator: 'receiver',
  hints: { host: '127.0.0.1', port: '54823' },
});
/** @type {OcapnLocation} */
export const gifterLocation = harden({
  type: 'ocapn-peer',
  transport: 'tcp-test-only',
  designator: 'gifter',
  hints: { host: '127.0.0.1', port: '54824' },
});

export const exampleSigParamBytes = uint8ArrayToImmutableArrayBuffer(
  Uint8Array.from({ length: 32 }, (_, i) => i),
);
export const examplePubKeyQBytes = uint8ArrayToImmutableArrayBuffer(
  Uint8Array.from({ length: 32 }, (_, i) => i * 2),
);

export const exporterKeyForGifter = makeOcapnKeyPairFromPrivateKey(
  Uint8Array.from({ length: 32 }, (_, i) => i * 1),
);
export const exporterKeyForReceiver = makeOcapnKeyPairFromPrivateKey(
  Uint8Array.from({ length: 32 }, (_, i) => i * 2),
);
export const gifterKeyForExporter = makeOcapnKeyPairFromPrivateKey(
  Uint8Array.from({ length: 32 }, (_, i) => i * 3),
);
export const gifterKeyForReceiver = makeOcapnKeyPairFromPrivateKey(
  Uint8Array.from({ length: 32 }, (_, i) => i * 4),
);
export const receiverKeyForGifter = makeOcapnKeyPairFromPrivateKey(
  Uint8Array.from({ length: 32 }, (_, i) => i * 5),
);
export const receiverKeyForExporter = makeOcapnKeyPairFromPrivateKey(
  Uint8Array.from({ length: 32 }, (_, i) => i * 6),
);

export const exampleExporterSessionId = /** @type {SessionId} */ (
  uint8ArrayToImmutableArrayBuffer(
    Uint8Array.from({ length: 32 }, (_, i) => i * 7),
  )
);
export const exampleGifterSideId = /** @type {PublicKeyId} */ (
  uint8ArrayToImmutableArrayBuffer(
    Uint8Array.from({ length: 32 }, (_, i) => i * 8),
  )
);
export const exampleGiftId = uint8ArrayToImmutableArrayBuffer(
  Uint8Array.from({ length: 32 }, (_, i) => i * 9),
);
export const exampleReceiverSessionId = /** @type {SessionId} */ (
  uint8ArrayToImmutableArrayBuffer(
    Uint8Array.from({ length: 32 }, (_, i) => i * 10),
  )
);
export const exampleReceiverSideId = /** @type {PublicKeyId} */ (
  uint8ArrayToImmutableArrayBuffer(
    Uint8Array.from({ length: 32 }, (_, i) => i * 11),
  )
);

/**
 * @typedef {object} CodecTestKit
 * @property {ReferenceKit} referenceKit
 * @property {import('../../src/client/sturdyrefs.js').SturdyRefTracker} sturdyRefTracker
 * @property {(position: bigint) => unknown} makeLocalObject
 * @property {(position: bigint) => unknown} makeLocalPromise
 * @property {(position: bigint) => Promise<unknown>} makeRemoteAnswer
 * @property {SyrupCodec} ReferenceCodec
 * @property {SyrupCodec} DescImportObjectCodec
 * @property {SyrupCodec} DescSigEnvelopeReadCodec
 * @property {SyrupCodec} OcapnMessageUnionCodec
 * @property {SyrupCodec} PassableCodec
 */

/**
 * @param {OcapnLocation} [ownLocation]
 * @param {OcapnLocation} peerLocation
 * @returns {CodecTestKit}
 */
export const makeCodecTestKit = (
  ownLocation = exporterLocation,
  peerLocation = receiverLocation,
) => {
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

  // Mock SturdyRef tracker for tests
  const swissnumTable = new Map(); // Empty table for tests
  const sturdyRefTracker = makeSturdyRefTracker(swissnumTable);
  const testHandoffMap = new Map();

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
    logger.info(`imported`, slot, val);
    const grantDetails = makeGrantDetails(peerLocation, slot);
    grantTracker.recordImport(val, grantDetails);
  };
  const exportHook = (val, slot) => {
    logger.info(`exported`, slot, val);
  };
  const slotCollectedHook = (slot, refcount) => {
    logger.info(`slotCollected`, slot, refcount);
  };
  const ocapnTable = makeOcapnTable(importHook, exportHook, slotCollectedHook);

  const sendHandoff = signedGive => {
    throw Error('sendHandoff is not implemented for test');
  };

  const referenceKit = makeReferenceKit(
    logger,
    peerLocation,
    ocapnTable,
    grantTracker,
    sturdyRefTracker,
    makeRemoteKit,
    makeHandoff,
    sendHandoff,
  );
  const descCodecs = makeDescCodecs(referenceKit);
  const passableCodecs = makePassableCodecs(descCodecs);
  const { OcapnMessageUnionCodec } = makeOcapnOperationsCodecs(
    descCodecs,
    passableCodecs,
  );
  const { PassableCodec } = passableCodecs;

  const makeLocalObject = position => {
    const slot = makeSlot('o', true, position);
    const value = Far('Local Export', {});
    ocapnTable.registerSlot(slot, value);
    return value;
  };

  const makeLocalPromise = position => {
    const slot = makeSlot('p', true, position);
    const value = Far('Local Promise', {});
    ocapnTable.registerSlot(slot, value);
    return value;
  };

  const makeRemoteAnswer = position => {
    const slot = makeSlot('a', false, position);
    const promise = Promise.resolve('remote answer');
    ocapnTable.registerSlot(slot, promise);
    return promise;
  };

  return {
    referenceKit,
    sturdyRefTracker,
    makeLocalObject,
    makeLocalPromise,
    makeRemoteAnswer,
    ...descCodecs,
    OcapnMessageUnionCodec,
    PassableCodec,
  };
};

/**
 * @typedef {object} CodecTestEntry
 * @property {string} name
 * @property {boolean} [only] // only run this test (via test.only)
 * @property {OcapnLocation} [ownLocation]
 * @property {OcapnLocation} [peerLocation]
 * @property {SyrupCodec} [codec]
 * @property {(testKit: CodecTestKit) => SyrupCodec} [getCodec]
 * @property {(testKit: CodecTestKit) => void} [beforeTest]
 * @property {any} [value]
 * @property {(testKit: CodecTestKit) => any} [makeValue]
 * @property {(testKit: CodecTestKit) => any} [makeExpectedValue]
 * @property {boolean} [skipRead]
 * @property {(t: any, actual: any, expected: any, descriptor: string) => void} [customAssert]
 */

/**
 * @param {any} t
 * @param {CodecTestEntry} testEntry
 */
export const testBidirectionally = (
  t,
  {
    ownLocation = exporterLocation,
    peerLocation = receiverLocation,
    codec: specifiedCodec,
    getCodec,
    beforeTest,
    value,
    makeValue,
    makeExpectedValue,
    skipRead = false,
    customAssert,
    name = '(unknown test entry)',
  },
) => {
  // const inputSyrupString = getSyrupString(syrup);
  // const testDescriptor = `${name} ${inputSyrupString}`;
  const testDescriptor = name;
  if ([value, makeValue].filter(arg => arg !== undefined).length > 1) {
    throw Error(`Only one of value, makeValue can be provided for ${name}`);
  }
  const testKit = makeCodecTestKit(ownLocation, peerLocation);
  const codec = specifiedCodec || (getCodec && getCodec(testKit));
  if (!codec) {
    throw Error(`codec or getCodec must be provided for ${name}`);
  }

  if (beforeTest) {
    beforeTest(testKit);
  }

  let inputValue = value;
  if (makeValue) {
    inputValue = makeValue(testKit);
  }
  const expectedValue = makeExpectedValue ? makeExpectedValue(testKit) : value;

  // Test write.
  // const expectedOutputSyrupString = getSyrupString(expectedOutputSyrup);
  // const expectedOutputSyrupBytes = getSyrupBytes(expectedOutputSyrup);
  const syrupWriter = makeSyrupWriter({ name: testDescriptor });
  notThrowsWithErrorUnwrapping(
    t,
    () => {
      codec.write(inputValue, syrupWriter);
    },
    `write syrup: ${testDescriptor}`,
  );
  const actualSyrupResultBytes = syrupWriter.getBytes();
  const { value: actualSyrupResultString, isValidUtf8 } = maybeDecode(
    actualSyrupResultBytes,
  );

  // Snapshot the syrup result as a string (if possible) otherwise hex encoded bytes.
  if (isValidUtf8) {
    t.snapshot(actualSyrupResultString, testDescriptor);
  } else {
    const hexEncoded = Array.from(actualSyrupResultBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join(' ');
    t.snapshot(hexEncoded, testDescriptor);
  }

  // It doesn't always make sense for the same codec to write and read the same value.
  // This is because the codecs close over the import/export table.
  if (skipRead) {
    return;
  }

  const readValueResult = codec.read(
    makeSyrupReader(actualSyrupResultBytes, {
      name: `${testDescriptor} read back`,
    }),
  );

  if (customAssert) {
    customAssert(
      t,
      readValueResult,
      expectedValue,
      `value check: ${testDescriptor}`,
    );
  } else {
    t.deepEqual(
      readValueResult,
      expectedValue,
      `value check: ${testDescriptor}`,
    );
  }
};

/**
 * @param {any} test
 * @param {string} tableName
 * @param {CodecTestEntry[]} table
 * @param {(testKit: CodecTestKit) => SyrupCodec} getCodec
 */
export const runTableTests = (test, tableName, table, getCodec) => {
  let hasOnly = false;
  for (const [index, entry] of table.entries()) {
    const { name = `test-${index}`, only } = entry;
    const testFunction = only ? test.only : test;
    if (only) {
      hasOnly = true;
    }
    testFunction(`affirmative table tests ${tableName}: ${name}`, t => {
      testBidirectionally(t, {
        // @ts-expect-error - name is specified more than once
        name,
        getCodec,
        ...entry,
      });
    });
  }
  if (hasOnly) {
    test.only('Disallow "only" in tables', t => {
      t.fail('"only" is not allowed in tables');
    });
  }
};

/**
 * @returns {HandoffGiveSigEnvelope}
 */
export const makeFixtureSignedHandoffGive = () => {
  return makeSignedHandoffGive(
    receiverKeyForGifter.publicKey,
    exporterLocation,
    exampleExporterSessionId,
    exampleGifterSideId,
    exampleGiftId,
    gifterKeyForExporter,
  );
};

/**
 * @returns {HandoffReceiveSigEnvelope}
 */
export const makeFixtureSignedHandoffReceive = () => {
  const signedHandoffGive = makeFixtureSignedHandoffGive();
  return makeSignedHandoffReceive(
    signedHandoffGive,
    1n,
    exampleReceiverSessionId,
    exampleReceiverSideId,
    receiverKeyForExporter,
  );
};
