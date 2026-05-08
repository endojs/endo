// @ts-check
import { randomBytes } from 'node:crypto';

import harden from '@endo/harden';
import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha2.js';

import {
  serializeOcapnMyLocation,
  serializeOcapnPublicKeyDescriptor,
} from './codecs/components.js';
import { compareUint8Arrays } from './bytewise-compare.js';
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
 * @import { OcapnCodec } from './codec-interface.js'
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
 * @param {ArrayBufferLike} peerIdOne
 * @param {ArrayBufferLike} peerIdTwo
 * @returns {SessionId}
 */
export const makeSessionId = (peerIdOne, peerIdTwo) => {
  const peerIdOneBytes = immutableArrayBufferToUint8Array(peerIdOne);
  const peerIdTwoBytes = immutableArrayBufferToUint8Array(peerIdTwo);
  const result = compareUint8Arrays(peerIdOneBytes, peerIdTwoBytes);
  const peerIds =
    result < 0
      ? [peerIdOneBytes, peerIdTwoBytes]
      : [peerIdTwoBytes, peerIdOneBytes];
  const sessionIdBytes = concatUint8Arrays([
    sessionIdHashPrefixBytes,
    ...peerIds,
  ]);
  const hash1 = sha256(sessionIdBytes);
  const hash2 = sha256(hash1);
  // @ts-expect-error - Branded type: SessionId is ArrayBufferLike at runtime
  return uint8ArrayToImmutableArrayBuffer(hash2);
};

/**
 * @returns {ArrayBufferLike}
 */
export const randomGiftId = () => {
  return uint8ArrayToImmutableArrayBuffer(randomBytes(16));
};

/**
 * @typedef {object} Cryptography
 * @property {(publicKeyBytes: ArrayBufferLike) => OcapnPublicKey} makeOcapnPublicKey
 * @property {(publicKeyDescriptor: OcapnPublicKeyDescriptor) => OcapnPublicKey} publicKeyDescriptorToPublicKey
 * @property {(privateKeyBytes: Uint8Array) => OcapnKeyPair} makeOcapnKeyPairFromPrivateKey
 * @property {() => OcapnKeyPair} makeOcapnKeyPair
 * @property {(location: OcapnLocation, keyPair: OcapnKeyPair, binding: ArrayBufferLike) => OcapnSignature} signLocation
 * @property {(location: OcapnLocation, signature: OcapnSignature, publicKey: OcapnPublicKey, binding: ArrayBufferLike) => void} assertLocationSignatureValid
 * @property {(handoffGive: HandoffGive, keyPair: OcapnKeyPair) => OcapnSignature} signHandoffGive
 * @property {(receiverPublicKeyForGifter: OcapnPublicKey, exporterLocation: OcapnLocation, gifterExporterSessionId: SessionId, gifterSideId: PublicKeyId, giftId: ArrayBufferLike, gifterKeyForExporter: OcapnKeyPair) => HandoffGiveSigEnvelope} makeSignedHandoffGive
 * @property {(handoffGive: HandoffGive, signature: OcapnSignature, publicKey: OcapnPublicKey) => void} assertHandoffGiveSignatureValid
 * @property {(handoffReceive: HandoffReceive, keyPair: OcapnKeyPair) => OcapnSignature} signHandoffReceive
 * @property {(handoffReceive: HandoffReceive, signature: OcapnSignature, publicKey: OcapnPublicKey) => void} assertHandoffReceiveSignatureValid
 * @property {(signedGive: HandoffGiveSigEnvelope, handoffCount: bigint, sessionId: SessionId, receiverPeerId: PublicKeyId, privKeyForGifter: OcapnKeyPair) => HandoffReceiveSigEnvelope} makeSignedHandoffReceive
 */

/**
 * Bind the cryptographic helpers that depend on canonical wire bytes to a
 * chosen codec. Signatures and public-key ids are computed over bytes
 * produced by the codec's writer, so both peers must agree on the codec.
 *
 * @param {OcapnCodec} codec
 * @returns {Cryptography}
 */
export const makeCryptography = codec => {
  /**
   * @param {OcapnPublicKeyDescriptor} publicKeyDescriptor
   * @returns {PublicKeyId}
   */
  const makePublicKeyIdFromDescriptor = publicKeyDescriptor => {
    const publicKeyDescriptorBytes = serializeOcapnPublicKeyDescriptor(
      publicKeyDescriptor,
      codec,
    );
    const hash1 = sha256(publicKeyDescriptorBytes);
    const hash2 = sha256(hash1);
    // @ts-expect-error - Branded type: PublicKeyId is ArrayBufferLike at runtime
    return uint8ArrayToImmutableArrayBuffer(hash2);
  };

  /**
   * @param {ArrayBufferLike} publicKeyBytes
   * @returns {OcapnPublicKey}
   */
  const makeOcapnPublicKey = publicKeyBytes => {
    const publicKeyDescriptor = makePublicKeyDescriptor(publicKeyBytes);
    return harden({
      id: makePublicKeyIdFromDescriptor(publicKeyDescriptor),
      bytes: publicKeyBytes,
      descriptor: publicKeyDescriptor,
      /**
       * @param {ArrayBufferLike} msgBytes
       * @param {OcapnSignature} ocapnSig
       */
      assertSignatureValid: (msgBytes, ocapnSig) => {
        const sigBytes = ocapNSignatureToBytes(ocapnSig);
        const msgUint8 = immutableArrayBufferToUint8Array(msgBytes);
        const pkUint8 = immutableArrayBufferToUint8Array(publicKeyBytes);
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
  const makeOcapnKeyPairFromPrivateKey = privateKeyBytes => {
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

  const makeOcapnKeyPair = () => {
    const privateKeyBytes = ed25519.utils.randomPrivateKey();
    return makeOcapnKeyPairFromPrivateKey(privateKeyBytes);
  };

  /**
   * @param {OcapnPublicKeyDescriptor} publicKeyDescriptor
   */
  const publicKeyDescriptorToPublicKey = publicKeyDescriptor => {
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

  // Domain-separation prefix for the location-signature payload.
  // Includes a length-prefixed channel-binding value (the Noise
  // handshake hash on the np netlayer; an empty buffer where no
  // session-bound binding is available, e.g. tcp-testing-only).
  const LOCATION_SIG_DOMAIN = (() => {
    const text = 'ocapn-location-v1\0';
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i);
    return bytes;
  })();

  /**
   * @param {OcapnLocation} location
   * @param {ArrayBufferLike} binding - Channel-binding value, e.g. the
   *   Noise handshake hash for the np netlayer. Pass `new ArrayBuffer(0)`
   *   when no session-bound binding is available.
   */
  const getLocationBytesForSignature = (location, binding) => {
    const myLocationBytes = serializeOcapnMyLocation(
      { type: 'my-location', location },
      codec,
    );
    /** @type {Uint8Array} */
    let bindingBytes;
    if (binding instanceof Uint8Array) {
      const u = /** @type {Uint8Array} */ (binding);
      bindingBytes = new Uint8Array(
        u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength),
      );
    } else {
      bindingBytes = new Uint8Array(
        /** @type {ArrayBufferLike} */ (binding).slice(0),
      );
    }
    // Backwards-compat path for the tcp-testing-only netlayer (and
    // any peer that hasn't yet adopted the binding-prefixed payload):
    // when the caller has no binding to assert, sign the bare
    // serialised `my-location` form.  This matches the canonical
    // wire bytes the OCapN python reference suite produces and
    // verifies, so tcp-testing-only interop is bit-for-bit unchanged.
    if (bindingBytes.length === 0) {
      return uint8ArrayToImmutableArrayBuffer(myLocationBytes);
    }
    // With a non-empty binding (e.g. the Noise handshake hash on the
    // np netlayer), prepend a domain-separator and length-prefix the
    // binding so the signature payload cannot be confused for the
    // unbound form OR for any other length/prefix collision.
    const out = new Uint8Array(
      LOCATION_SIG_DOMAIN.length +
        4 +
        bindingBytes.length +
        myLocationBytes.length,
    );
    let offset = 0;
    out.set(LOCATION_SIG_DOMAIN, offset);
    offset += LOCATION_SIG_DOMAIN.length;
    new DataView(out.buffer, out.byteOffset).setUint32(
      offset,
      bindingBytes.length,
      false,
    );
    offset += 4;
    out.set(bindingBytes, offset);
    offset += bindingBytes.length;
    out.set(myLocationBytes, offset);
    return uint8ArrayToImmutableArrayBuffer(out);
  };

  /**
   * @param {OcapnLocation} location
   * @param {OcapnKeyPair} keyPair
   * @param {ArrayBufferLike} binding - Channel-binding value (32-byte
   *   Noise handshake hash on the np netlayer; `new ArrayBuffer(0)` for
   *   tcp-testing-only).
   */
  const signLocation = (location, keyPair, binding) => {
    const locationBytes = getLocationBytesForSignature(location, binding);
    return keyPair.sign(locationBytes);
  };

  /**
   * @param {OcapnLocation} location
   * @param {OcapnSignature} signature
   * @param {OcapnPublicKey} publicKey
   * @param {ArrayBufferLike} binding - Same channel-binding value the
   *   signer used.
   */
  const assertLocationSignatureValid = (
    location,
    signature,
    publicKey,
    binding,
  ) => {
    const locationBytes = getLocationBytesForSignature(location, binding);
    publicKey.assertSignatureValid(locationBytes, signature);
  };

  /**
   * @param {HandoffGive} handoffGive
   * @param {OcapnKeyPair} keyPair
   */
  const signHandoffGive = (handoffGive, keyPair) => {
    const handoffGiveBytes = serializeHandoffGive(handoffGive, codec);
    return keyPair.sign(handoffGiveBytes);
  };

  const makeSignedHandoffGive = (
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
   */
  const assertHandoffGiveSignatureValid = (
    handoffGive,
    signature,
    publicKey,
  ) => {
    const handoffGiveBytes = serializeHandoffGive(handoffGive, codec);
    publicKey.assertSignatureValid(handoffGiveBytes, signature);
  };

  /**
   * @param {HandoffReceive} handoffReceive
   * @param {OcapnKeyPair} keyPair
   */
  const signHandoffReceive = (handoffReceive, keyPair) => {
    const handoffReceiveBytes = serializeHandoffReceive(handoffReceive, codec);
    return keyPair.sign(handoffReceiveBytes);
  };

  /**
   * @param {HandoffReceive} handoffReceive
   * @param {OcapnSignature} signature
   * @param {OcapnPublicKey} publicKey
   */
  const assertHandoffReceiveSignatureValid = (
    handoffReceive,
    signature,
    publicKey,
  ) => {
    const handoffReceiveBytes = serializeHandoffReceive(handoffReceive, codec);
    publicKey.assertSignatureValid(handoffReceiveBytes, signature);
  };

  const makeSignedHandoffReceive = (
    signedGive,
    handoffCount,
    sessionId,
    receiverPeerId,
    privKeyForGifter,
  ) => {
    const handoffReceive = makeHandoffReceiveDescriptor(
      signedGive,
      handoffCount,
      sessionId,
      receiverPeerId,
    );
    const signature = signHandoffReceive(handoffReceive, privKeyForGifter);
    return makeHandoffReceiveSigEnvelope(handoffReceive, signature);
  };

  return harden({
    makeOcapnPublicKey,
    publicKeyDescriptorToPublicKey,
    makeOcapnKeyPairFromPrivateKey,
    makeOcapnKeyPair,
    signLocation,
    assertLocationSignatureValid,
    signHandoffGive,
    makeSignedHandoffGive,
    assertHandoffGiveSignatureValid,
    signHandoffReceive,
    assertHandoffReceiveSignatureValid,
    makeSignedHandoffReceive,
  });
};
