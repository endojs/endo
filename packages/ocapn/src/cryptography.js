// @ts-check
import { randomBytes } from 'node:crypto';

import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha2.js';

import {
  serializeOcapnMyLocation,
  serializeOcapnPublicKeyDescriptor,
} from './codecs/components.js';
import { compareByteArrays } from './syrup/compare.js';
import {
  makeHandoffReceiveDescriptor,
  makeHandoffReceiveSigEnvelope,
  serializeHandoffGive,
  serializeHandoffReceive,
} from './codecs/descriptors.js';

/**
 * @import { OcapnLocation, OcapnPublicKeyDescriptor, OcapnSignature } from './codecs/components.js'
 * @import { HandoffGive, HandoffReceive, HandoffGiveSigEnvelope, HandoffReceiveSigEnvelope } from './codecs/descriptors.js'
 */

const textEncoder = new TextEncoder();

/**
 * @typedef {object} OcapnPublicKey
 * @property {Uint8Array} id
 * @property {Uint8Array} bytes
 * @property {OcapnPublicKeyDescriptor} descriptor
 * @property {(msg: Uint8Array, sig: OcapnSignature) => boolean} verify
 */

/**
 * @typedef {object} OcapnKeyPair
 * @property {OcapnPublicKey} publicKey
 * @property {(msg: Uint8Array) => OcapnSignature} sign
 */

/**
 * @param {OcapnSignature} sig
 * @returns {Uint8Array}
 */
export const ocapNSignatureToBytes = sig => {
  const result = new Uint8Array(sig.r.length + sig.s.length);
  result.set(sig.r, 0);
  result.set(sig.s, sig.r.length);
  return result;
};

/**
 * @param {Uint8Array} publicKeyBytes
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
 * @returns {Uint8Array}
 */
const makePublicKeyIdFromDescriptor = publicKeyDescriptor => {
  const publicKeyDescriptorBytes =
    serializeOcapnPublicKeyDescriptor(publicKeyDescriptor);
  return sha256(sha256(publicKeyDescriptorBytes));
};

/**
 * @param {Uint8Array} publicKeyBytes
 * @returns {OcapnPublicKey}
 */
export const makeOcapnPublicKey = publicKeyBytes => {
  const publicKeyDescriptor = makePublicKeyDescriptor(publicKeyBytes);
  return harden({
    id: makePublicKeyIdFromDescriptor(publicKeyDescriptor),
    bytes: publicKeyBytes,
    descriptor: publicKeyDescriptor,
    /**
     * @param {Uint8Array} msgBytes
     * @param {OcapnSignature} ocapnSig
     * @returns {boolean}
     */
    verify: (msgBytes, ocapnSig) => {
      const sigBytes = ocapNSignatureToBytes(ocapnSig);
      return ed25519.verify(sigBytes, msgBytes, publicKeyBytes);
    },
  });
};

/**
 * @returns {OcapnKeyPair}
 */
export const makeOcapnKeyPair = () => {
  const privateKeyBytes = ed25519.utils.randomPrivateKey();
  const publicKeyBytes = ed25519.getPublicKey(privateKeyBytes);
  return {
    publicKey: makeOcapnPublicKey(publicKeyBytes),
    sign: msg => {
      const sigBytes = ed25519.sign(msg, privateKeyBytes);
      return {
        type: 'sig-val',
        scheme: 'eddsa',
        r: sigBytes.slice(0, 32),
        s: sigBytes.slice(32),
      };
    },
  };
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
  if (publicKeyDescriptor.q.length !== 32) {
    throw new Error('Invalid public key descriptor: Unexpected q length');
  }
  return makeOcapnPublicKey(publicKeyDescriptor.q);
};

/**
 * @param {Uint8Array} peerIdOne
 * @param {Uint8Array} peerIdTwo
 * @returns {Uint8Array}
 */
export const makeSessionId = (peerIdOne, peerIdTwo) => {
  // Sort both IDs based on the resulting octets
  const result = compareByteArrays(
    peerIdOne,
    peerIdTwo,
    0,
    peerIdOne.length,
    0,
    peerIdTwo.length,
  );
  const peerIds = result < 0 ? [peerIdOne, peerIdTwo] : [peerIdTwo, peerIdOne];
  // Concatinating them in the order from number 3
  // Append the string "prot0" to the beginning
  const inputBytes = new Uint8Array([
    ...textEncoder.encode('prot0'),
    ...peerIds[0],
    ...peerIds[1],
  ]);
  // Double SHA256 hash the resulting string
  return sha256(sha256(inputBytes));
};

/**
 * @param {OcapnLocation} location
 * @returns {Uint8Array}
 */
const getLocationBytesForSignature = location => {
  return serializeOcapnMyLocation({
    type: 'my-location',
    location,
  });
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
 * @returns {Uint8Array}
 */
export const randomGiftId = () => {
  return randomBytes(16);
};

/**
 * @param {HandoffGiveSigEnvelope} signedGive
 * @param {bigint} handoffCount
 * @param {Uint8Array} sessionId
 * @param {Uint8Array} receiverPeerId
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
