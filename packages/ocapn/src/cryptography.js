// @ts-check
import { randomBytes } from 'node:crypto';

import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha2.js';

import {
  serializeOcapnMyLocation,
  serializeOcapnPublicKeyDescriptor,
} from './codecs/components.js';
import { compareUint8Arrays } from './syrup/compare.js';
import {
  makeHandoffGiveDescriptor,
  makeHandoffGiveSigEnvelope,
  makeHandoffReceiveDescriptor,
  makeHandoffReceiveSigEnvelope,
  serializeHandoffGive,
  serializeHandoffReceive,
} from './codecs/descriptors.js';
import {
  uint8ArrayToImmutableArrayBuffer,
  immutableArrayBufferToUint8Array,
  concatUint8Arrays,
} from './buffer-utils.js';

/**
 * @import { OcapnLocation, OcapnPublicKeyDescriptor, OcapnSignature } from './codecs/components.js'
 * @import { HandoffGive, HandoffReceive, HandoffGiveSigEnvelope, HandoffReceiveSigEnvelope } from './codecs/descriptors.js'
 * @import { SessionId, PublicKeyId } from './client/types.js'
 */

const textEncoder = new TextEncoder();

const sessionIdHashPrefixBytes = textEncoder.encode('prot0');

/**
 * @typedef {object} OcapnPublicKey
 * @property {PublicKeyId} id
 * @property {ArrayBufferLike} bytes
 * @property {OcapnPublicKeyDescriptor} descriptor
 * @property {(msg: ArrayBufferLike, sig: OcapnSignature) => boolean} verify
 */

/**
 * @typedef {object} OcapnKeyPair
 * @property {OcapnPublicKey} publicKey
 * @property {(msg: ArrayBufferLike) => OcapnSignature} sign
 */

/**
 * @param {OcapnSignature} sig
 * @returns {Uint8Array}
 */
const ocapNSignatureToBytes = sig => {
  const rBytes = immutableArrayBufferToUint8Array(sig.r);
  const sBytes = immutableArrayBufferToUint8Array(sig.s);
  return concatUint8Arrays([rBytes, sBytes]);
};

/**
 * @param {ArrayBufferLike} publicKeyBytes
 * @returns {OcapnPublicKeyDescriptor}
 */
const makePublicKeyDescriptor = publicKeyBytes => {
  return {
    type: 'public-key',
    scheme: 'ecc',
    curve: 'Ed25519',
    flags: 'eddsa',
    q: publicKeyBytes,
  };
};

/**
 * @param {OcapnPublicKeyDescriptor} publicKeyDescriptor
 * @returns {PublicKeyId}
 */
const makePublicKeyIdFromDescriptor = publicKeyDescriptor => {
  const publicKeyDescriptorBytes =
    serializeOcapnPublicKeyDescriptor(publicKeyDescriptor);
  const hash1 = sha256(publicKeyDescriptorBytes);
  const hash2 = sha256(hash1);
  // @ts-expect-error - Branded type: PublicKeyId is ArrayBufferLike at runtime
  return uint8ArrayToImmutableArrayBuffer(hash2);
};

/**
 * @param {ArrayBufferLike} publicKeyBytes
 * @returns {OcapnPublicKey}
 */
export const makeOcapnPublicKey = publicKeyBytes => {
  const publicKeyDescriptor = makePublicKeyDescriptor(publicKeyBytes);
  return harden({
    id: makePublicKeyIdFromDescriptor(publicKeyDescriptor),
    bytes: publicKeyBytes,
    descriptor: publicKeyDescriptor,
    /**
     * @param {ArrayBufferLike} msgBytes
     * @param {OcapnSignature} ocapnSig
     * @returns {boolean}
     */
    verify: (msgBytes, ocapnSig) => {
      const sigBytes = ocapNSignatureToBytes(ocapnSig);
      const msgUint8 = immutableArrayBufferToUint8Array(msgBytes);
      const pkUint8 = immutableArrayBufferToUint8Array(publicKeyBytes);
      return ed25519.verify(sigBytes, msgUint8, pkUint8);
    },
  });
};

/**
 * @param {Uint8Array} privateKeyBytes
 * @returns {OcapnKeyPair}
 */
export const makeOcapnKeyPairFromPrivateKey = privateKeyBytes => {
  const publicKeyBytes = ed25519.getPublicKey(privateKeyBytes);
  const publicKeyBuffer = uint8ArrayToImmutableArrayBuffer(publicKeyBytes);
  return {
    publicKey: makeOcapnPublicKey(publicKeyBuffer),
    sign: msg => {
      const msgBytes = immutableArrayBufferToUint8Array(msg);
      const sigBytes = ed25519.sign(msgBytes, privateKeyBytes);
      return {
        type: 'sig-val',
        scheme: 'eddsa',
        r: uint8ArrayToImmutableArrayBuffer(sigBytes.slice(0, 32)),
        s: uint8ArrayToImmutableArrayBuffer(sigBytes.slice(32)),
      };
    },
  };
};

/**
 * @returns {OcapnKeyPair}
 */
export const makeOcapnKeyPair = () => {
  const privateKeyBytes = ed25519.utils.randomPrivateKey();
  return makeOcapnKeyPairFromPrivateKey(privateKeyBytes);
};

/**
 * @param {OcapnPublicKeyDescriptor} publicKeyDescriptor
 * @returns {OcapnPublicKey}
 */
export const publicKeyDescriptorToPublicKey = publicKeyDescriptor => {
  if (publicKeyDescriptor.type !== 'public-key') {
    throw new Error('Invalid public key descriptor: Unexpected type');
  }
  if (publicKeyDescriptor.scheme !== 'ecc') {
    throw new Error('Invalid public key descriptor: Unexpected scheme');
  }
  if (publicKeyDescriptor.curve !== 'Ed25519') {
    throw new Error('Invalid public key descriptor: Unexpected curve');
  }
  if (publicKeyDescriptor.flags !== 'eddsa') {
    throw new Error('Invalid public key descriptor: Unexpected flags');
  }
  if (publicKeyDescriptor.q.byteLength !== 32) {
    throw new Error('Invalid public key descriptor: Unexpected q length');
  }
  return makeOcapnPublicKey(publicKeyDescriptor.q);
};

/**
 * @param {ArrayBufferLike} peerIdOne
 * @param {ArrayBufferLike} peerIdTwo
 * @returns {SessionId}
 */
export const makeSessionId = (peerIdOne, peerIdTwo) => {
  // Convert to Uint8Array for comparison
  const peerIdOneBytes = immutableArrayBufferToUint8Array(peerIdOne);
  const peerIdTwoBytes = immutableArrayBufferToUint8Array(peerIdTwo);

  // Sort both IDs based on the resulting octets
  const result = compareUint8Arrays(peerIdOneBytes, peerIdTwoBytes);
  const peerIds =
    result < 0
      ? [peerIdOneBytes, peerIdTwoBytes]
      : [peerIdTwoBytes, peerIdOneBytes];
  // Concatinating them in the order from number 3
  // Append the string "prot0" to the beginning
  const sessionIdBytes = concatUint8Arrays([
    sessionIdHashPrefixBytes,
    ...peerIds,
  ]);
  // Double SHA256 hash the resulting string
  const hash1 = sha256(sessionIdBytes);
  const hash2 = sha256(hash1);
  // @ts-expect-error - Branded type: SessionId is ArrayBufferLike at runtime
  return uint8ArrayToImmutableArrayBuffer(hash2);
};

/**
 * @param {OcapnLocation} location
 * @returns {ArrayBufferLike}
 */
const getLocationBytesForSignature = location => {
  const myLocationBytes = serializeOcapnMyLocation({
    type: 'my-location',
    location,
  });
  return uint8ArrayToImmutableArrayBuffer(myLocationBytes);
};

/**
 * @param {OcapnLocation} location
 * @param {OcapnKeyPair} keyPair
 * @returns {OcapnSignature}
 */
export const signLocation = (location, keyPair) => {
  const locationBytes = getLocationBytesForSignature(location);
  return keyPair.sign(locationBytes);
};

/**
 * @param {OcapnLocation} location
 * @param {OcapnSignature} signature
 * @param {OcapnPublicKey} publicKey
 * @returns {boolean}
 */
export const verifyLocationSignature = (location, signature, publicKey) => {
  const locationBytes = getLocationBytesForSignature(location);
  return publicKey.verify(locationBytes, signature);
};

/**
 * @param {HandoffGive} handoffGive
 * @param {OcapnKeyPair} keyPair
 * @returns {OcapnSignature}
 */
export const signHandoffGive = (handoffGive, keyPair) => {
  const handoffGiveBytes = serializeHandoffGive(handoffGive);
  return keyPair.sign(handoffGiveBytes);
};

/**
 * @param {OcapnPublicKey} receiverPublicKeyForGifter
 * @param {OcapnLocation} exporterLocation
 * @param {SessionId} gifterExporterSessionId
 * @param {PublicKeyId} gifterSideId
 * @param {ArrayBufferLike} giftId
 * @param {OcapnKeyPair} gifterKeyForExporter
 * @returns {HandoffGiveSigEnvelope}
 */
export const makeSignedHandoffGive = (
  receiverPublicKeyForGifter,
  exporterLocation,
  gifterExporterSessionId,
  gifterSideId,
  giftId,
  gifterKeyForExporter,
) => {
  const handoffGive = makeHandoffGiveDescriptor(
    receiverPublicKeyForGifter.descriptor,
    exporterLocation,
    gifterExporterSessionId,
    gifterSideId,
    giftId,
  );
  const signature = signHandoffGive(handoffGive, gifterKeyForExporter);
  return makeHandoffGiveSigEnvelope(handoffGive, signature);
};

/**
 * @param {HandoffGive} handoffGive
 * @param {OcapnSignature} signature
 * @param {OcapnPublicKey} publicKey
 * @returns {boolean}
 */
export const verifyHandoffGiveSignature = (
  handoffGive,
  signature,
  publicKey,
) => {
  const handoffGiveBytes = serializeHandoffGive(handoffGive);
  return publicKey.verify(handoffGiveBytes, signature);
};

/**
 * @param {HandoffReceive} handoffReceive
 * @param {OcapnKeyPair} keyPair
 * @returns {OcapnSignature}
 */
export const signHandoffReceive = (handoffReceive, keyPair) => {
  const handoffReceiveBytes = serializeHandoffReceive(handoffReceive);
  return keyPair.sign(handoffReceiveBytes);
};

/**
 * @param {HandoffReceive} handoffReceive
 * @param {OcapnSignature} signature
 * @param {OcapnPublicKey} publicKey
 * @returns {boolean}
 */
export const verifyHandoffReceiveSignature = (
  handoffReceive,
  signature,
  publicKey,
) => {
  const handoffReceiveBytes = serializeHandoffReceive(handoffReceive);
  return publicKey.verify(handoffReceiveBytes, signature);
};

/**
 * @returns {ArrayBufferLike}
 */
export const randomGiftId = () => {
  return uint8ArrayToImmutableArrayBuffer(randomBytes(16));
};

/**
 * @param {HandoffGiveSigEnvelope} signedGive
 * @param {bigint} handoffCount
 * @param {SessionId} sessionId
 * @param {PublicKeyId} receiverPeerId
 * @param {OcapnKeyPair} privKeyForGifter
 * @returns {HandoffReceiveSigEnvelope}
 */
export const makeSignedHandoffReceive = (
  signedGive,
  handoffCount,
  sessionId,
  receiverPeerId,
  privKeyForGifter,
) => {
  /** @type {HandoffReceive} */
  const handoffReceive = makeHandoffReceiveDescriptor(
    signedGive,
    handoffCount,
    sessionId,
    receiverPeerId,
  );
  const signature = signHandoffReceive(handoffReceive, privKeyForGifter);
  return makeHandoffReceiveSigEnvelope(handoffReceive, signature);
};
