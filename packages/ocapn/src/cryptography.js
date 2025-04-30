// @ts-check

import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha2.js';

import { makeSyrupWriter } from './syrup/encode.js';
import { OCapNPublicKey } from './codecs/components.js';

/** @typedef {import('./codecs/components.js').OCapNSignature} OCapNSignature */
/** @typedef {import('./codecs/components.js').OCapNPublicKeyData} OCapNPublicKeyData */

/**
 * @typedef {object} OCapNPublicKey
 * @property {Uint8Array} bytes
 * @property {(msg: Uint8Array, sig: OCapNSignature) => boolean} verify
 */

/**
 * @typedef {object} OCapNKeyPair
 * @property {OCapNPublicKey} publicKey
 * @property {(msg: Uint8Array) => OCapNSignature} sign
 */

/**
 * @param {OCapNSignature} sig
 * @returns {Uint8Array}
 */
const oCapNSignatureToBytes = sig => {
  return Uint8Array.from([...sig.r, ...sig.s]);
};

/**
 * @param {Uint8Array} publicKey
 * @returns {OCapNPublicKey}
 */
export const makeOCapNPublicKey = publicKey => {
  return {
    bytes: publicKey,
    /**
     * @param {Uint8Array} msgBytes
     * @param {OCapNSignature} ocapnSig
     * @returns {boolean}
     */
    verify: (msgBytes, ocapnSig) => {
      const sigBytes = oCapNSignatureToBytes(ocapnSig);
      return ed25519.verify(sigBytes, msgBytes, publicKey);
    },
  };
};

/**
 * @returns {OCapNKeyPair}
 */
export const makeOCapNKeyPair = () => {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);
  return {
    publicKey: makeOCapNPublicKey(publicKey),
    sign: msg => {
      const sigBytes = ed25519.sign(msg, privateKey);
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
 * @param {OCapNPublicKey} publicKey
 * @returns {OCapNPublicKeyData}
 */
export const publicKeyToPublicKeyData = publicKey => {
  return {
    type: 'public-key',
    scheme: 'ecc',
    curve: 'Ed25519',
    flags: 'eddsa',
    q: publicKey.bytes,
  };
};

/**
 * @param {OCapNPublicKeyData} publicKeyData
 * @returns {Uint8Array}
 */
const publicKeyDataToEncodedBytes = publicKeyData => {
  const syrupWriter = makeSyrupWriter();
  OCapNPublicKey.write(publicKeyData, syrupWriter);
  return syrupWriter.getBytes();
};

/**
 * @param {OCapNPublicKeyData} publicKeyData
 * @returns {Uint8Array}
 */
export const makeCrossedHellosIdForPublicKeyData = publicKeyData => {
  const publicKeyEncoded = publicKeyDataToEncodedBytes(publicKeyData);
  // Double SHA256 hash of the public key
  return sha256(sha256(publicKeyEncoded));
};
