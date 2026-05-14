// @ts-check
import { randomBytes } from 'node:crypto';

import harden from '@endo/harden';
import { bytesToImmutable } from '@endo/bytes/to-immutable.js';
import { bytesFromImmutable } from '@endo/bytes/from-immutable.js';
import { concatBytes } from '@endo/bytes/concat.js';
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
 * @property {(msg: ArrayBufferLike, sig: OcapnSignature) => void} assertSignatureValid - Throws if signature is invalid
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
  const rBytes = bytesFromImmutable(sig.r);
  const sBytes = bytesFromImmutable(sig.s);
  return concatBytes([rBytes, sBytes]);
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
  return bytesToImmutable(hash2);
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
     * Asserts that the signature is valid for the given message.
     * @param {ArrayBufferLike} msgBytes
     * @param {OcapnSignature} ocapnSig
     * @throws {Error} If the signature is invalid
     */
    assertSignatureValid: (msgBytes, ocapnSig) => {
      const sigBytes = ocapNSignatureToBytes(ocapnSig);
      const msgUint8 = bytesFromImmutable(msgBytes);
      const pkUint8 = bytesFromImmutable(publicKeyBytes);
      const isValid = ed25519.verify(sigBytes, msgUint8, pkUint8);
      if (!isValid) {
        throw new Error('Invalid signature');
      }
    },
  });
};

/**
 * @param {Uint8Array} privateKeyBytes
 * @returns {OcapnKeyPair}
 */
export const makeOcapnKeyPairFromPrivateKey = privateKeyBytes => {
  const publicKeyBytes = ed25519.getPublicKey(privateKeyBytes);
  const publicKeyBuffer = bytesToImmutable(publicKeyBytes);
  return {
    publicKey: makeOcapnPublicKey(publicKeyBuffer),
    sign: msg => {
      const msgBytes = bytesFromImmutable(msg);
      const sigBytes = ed25519.sign(msgBytes, privateKeyBytes);
      return {
        type: 'sig-val',
        scheme: 'eddsa',
        r: bytesToImmutable(sigBytes.slice(0, 32)),
        s: bytesToImmutable(sigBytes.slice(32)),
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
  const peerIdOneBytes = bytesFromImmutable(peerIdOne);
  const peerIdTwoBytes = bytesFromImmutable(peerIdTwo);

  // Sort both IDs based on the resulting octets
  const result = compareUint8Arrays(peerIdOneBytes, peerIdTwoBytes);
  const peerIds =
    result < 0
      ? [peerIdOneBytes, peerIdTwoBytes]
      : [peerIdTwoBytes, peerIdOneBytes];
  // Concatinating them in the order from number 3
  // Append the string "prot0" to the beginning
  const sessionIdBytes = concatBytes([sessionIdHashPrefixBytes, ...peerIds]);
  // Double SHA256 hash the resulting string
  const hash1 = sha256(sessionIdBytes);
  const hash2 = sha256(hash1);
  // @ts-expect-error - Branded type: SessionId is ArrayBufferLike at runtime
  return bytesToImmutable(hash2);
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
  return bytesToImmutable(myLocationBytes);
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
 * Asserts that the location signature is valid.
 * @param {OcapnLocation} location
 * @param {OcapnSignature} signature
 * @param {OcapnPublicKey} publicKey
 * @throws {Error} If the signature is invalid
 */
export const assertLocationSignatureValid = (
  location,
  signature,
  publicKey,
) => {
  const locationBytes = getLocationBytesForSignature(location);
  publicKey.assertSignatureValid(locationBytes, signature);
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
 * Asserts that the handoff give signature is valid.
 * @param {HandoffGive} handoffGive
 * @param {OcapnSignature} signature
 * @param {OcapnPublicKey} publicKey
 * @throws {Error} If the signature is invalid
 */
export const assertHandoffGiveSignatureValid = (
  handoffGive,
  signature,
  publicKey,
) => {
  const handoffGiveBytes = serializeHandoffGive(handoffGive);
  publicKey.assertSignatureValid(handoffGiveBytes, signature);
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
 * Asserts that the handoff receive signature is valid.
 * @param {HandoffReceive} handoffReceive
 * @param {OcapnSignature} signature
 * @param {OcapnPublicKey} publicKey
 * @throws {Error} If the signature is invalid
 */
export const assertHandoffReceiveSignatureValid = (
  handoffReceive,
  signature,
  publicKey,
) => {
  const handoffReceiveBytes = serializeHandoffReceive(handoffReceive);
  publicKey.assertSignatureValid(handoffReceiveBytes, signature);
};

/**
 * @returns {ArrayBufferLike}
 */
export const randomGiftId = () => {
  return bytesToImmutable(randomBytes(16));
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
