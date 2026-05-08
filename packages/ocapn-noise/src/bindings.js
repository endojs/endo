/* eslint-disable no-use-before-define */

import harden from '@endo/harden';

/**
 * @typedef {object} SigningKeys
 * @property {Uint8Array} privateKey - The ed25519 signing-key seed (32 bytes)
 * @property {Uint8Array} publicKey - The ed25519 verifying key (32 bytes)
 */

/**
 * @typedef {object} OcapnSessionCryptographyOptions
 * @property {WebAssembly.Module} wasmModule - The compiled WASM module
 * @property {(array: Uint8Array) => void} getRandomValues - Function to fill array with random values
 * @property {SigningKeys} [signingKeys] - Optional pre-generated signing keys
 * @property {number[]} [supportedEncodings] - Array of supported encoding versions (default: [0])
 */

/**
 * @typedef {object} InitiatorResult
 * @property {SigningKeys} signingKeys - The generated or provided signing keys
 * @property {(intendedResponderKey: Uint8Array, prefixedSyn: Uint8Array) => InitiatorWriteSynResult} initiatorWriteSyn - Function to write prefixed SYN message
 */

/**
 * @typedef {object} ResponderResult
 * @property {SigningKeys} signingKeys - The generated or provided signing keys
 * @property {(prefixedSyn: Uint8Array, synack: Uint8Array) => ResponderReadSynWriteSynackResult} responderReadSynWriteSynack - Function to read prefixed SYN and write SYNACK
 */

/**
 * @typedef {object} InitiatorWriteSynResult
 * @property {(synack: Uint8Array) => InitiatorReadSynackResult} initiatorReadSynack - Function to read SYNACK and finalize the handshake
 */

/**
 * @typedef {object} ResponderReadSynWriteSynackResult
 * @property {Uint8Array} initiatorVerifyingKey - The initiator's ed25519 verifying key (32 bytes)
 * @property {number} encoding - The negotiated encoding version
 * @property {(message: Uint8Array) => Uint8Array} encrypt - Function to encrypt session messages
 * @property {(message: Uint8Array) => Uint8Array} decrypt - Function to decrypt session messages
 * @property {Uint8Array} handshakeHash - 32-byte Noise handshake hash for channel binding
 */

/**
 * @typedef {object} InitiatorReadSynackResult
 * @property {number} encoding - The negotiated encoding version
 * @property {(message: Uint8Array) => Uint8Array} encrypt - Function to encrypt session messages
 * @property {(message: Uint8Array) => Uint8Array} decrypt - Function to decrypt session messages
 * @property {Uint8Array} handshakeHash - 32-byte Noise handshake hash for channel binding
 */

/**
 * @typedef {object} OcapnSessionCryptography
 * @property {() => InitiatorResult} asInitiator - Create an initiator instance
 * @property {() => ResponderResult} asResponder - Create a responder instance
 */

// BUFFER offsets (must match `rust/ocapn_noise/src/lib.rs`).
const SIGNING_KEY_OFFSET = 64;
const SIGNING_KEY_LENGTH = 32;
const INTENDED_RESPONDER_KEY_OFFSET = 96;
const INTENDED_RESPONDER_KEY_LENGTH = 32;
const INITIATOR_VERIFYING_KEY_OFFSET = 128;
const VERIFYING_KEY_LENGTH = 32;
// FIRST_ENCODING + OTHER_ENCODINGS bitmask sit inside the encrypted SYN
// payload at the tail, immediately after INITIATOR_VERIFYING_KEY:
//   SYN_PAYLOAD = INITIATOR_VERIFYING_KEY (32B) || encoding (4B) = 36B
const FIRST_ENCODING_OFFSET = 160;
const SYN_OFFSET = 256;
// SYN = 32 (e) + 32 + 16 (encrypted s) + 36 + 16 (encrypted payload).
export const SYN_LENGTH = 132;
export const PREFIXED_SYN_LENGTH = INTENDED_RESPONDER_KEY_LENGTH + SYN_LENGTH;
const ACCEPTED_ENCODING_OFFSET = 416;
const SYNACK_OFFSET = 544;
// SYNACK = 32 (e) + 1 + 16 (encrypted payload).
export const SYNACK_LENGTH = 49;
const HANDSHAKE_HASH_OFFSET = 800;
export const HANDSHAKE_HASH_LENGTH = 32;

/**
 * Encodes supported encoding versions into a buffer for transmission.
 *
 * @param {Uint8Array} bytes - The view to write to (must be at least 4 bytes:
 *   2 bytes for the first encoding + 2 bytes for the mask of additional encodings)
 * @param {number[]} supportedEncodings - Array of supported encoding versions
 *   (1-17 distinct versions, each 0-65535, with the highest no more than 16
 *   versions above the lowest)
 * @throws {Error} If no encodings provided, too many encodings, or invalid encoding values
 */
// exported for testing
export const encodeSupportedEncodingsInto = (bytes, supportedEncodings) => {
  if (supportedEncodings.length === 0) {
    throw new Error('Must support at least one encoding version');
  }
  if (supportedEncodings.length > 16 + 1) {
    throw new Error(
      'Cannot support more than 17 encoding versions simultaneously',
    );
  }
  const firstEncoding = Math.min(...supportedEncodings);
  let moreEncodingsMask = 0;
  for (const encoding of supportedEncodings) {
    if (encoding > 65535) {
      throw new Error(
        `Cannot support encoding versions beyond 65535, got ${encoding}`,
      );
    }
    if (encoding === firstEncoding) {
      // eslint-disable-next-line no-continue
      continue;
    }
    // eslint-disable-next-line no-bitwise
    const encodingBit = 0xff_ff & (1 << (encoding - firstEncoding - 1));
    if (!encodingBit) {
      throw new Error(
        `Cannot simultaneously support encodings that are more than 16 versions apart, got ${supportedEncodings.join(', ')}`,
      );
    }
    // eslint-disable-next-line no-bitwise
    moreEncodingsMask |= encodingBit;
  }
  const dataView = new DataView(bytes.buffer, bytes.byteOffset);
  dataView.setUint16(0, firstEncoding, false); // false for big endian
  dataView.setUint16(2, moreEncodingsMask, false); // false for big endian
};

/**
 * Decodes supported encoding versions from a Uint8Array.
 *
 * @param {Uint8Array} bytes - The view to read from (must be at least 4 bytes)
 * @returns {number[]} Array of supported encoding versions
 */
const decodeSupportedEncodingsFrom = bytes => {
  const dataView = new DataView(bytes.buffer, bytes.byteOffset);

  const encodings = [];

  let encoding = dataView.getUint16(0, false); // false for big endian
  encodings.push(encoding);
  encoding += 1;

  let moreEncodingsMask = dataView.getUint16(2, false); // false for big endian
  while (moreEncodingsMask) {
    // eslint-disable-next-line no-bitwise
    if (moreEncodingsMask & 1) {
      encodings.push(encoding);
    }
    encoding += 1;
    // eslint-disable-next-line no-bitwise
    moreEncodingsMask >>= 1;
  }

  return encodings;
};

/**
 * Creates an OCapN Session Cryptography instance for Noise Protocol handshakes.
 *
 * Implements `Noise_IK_25519_ChaChaPoly_BLAKE2s`.  The initiator must
 * know the responder's Ed25519 verifying key in advance; the WASM
 * derives both peers' static X25519 keys from their Ed25519 seeds via
 * `to_scalar_bytes()` / `to_montgomery()` (the libsodium / age /
 * wireguard-tools convention) so a single Ed25519 keypair backs both
 * the OCapN identity and the Noise handshake.
 *
 * The handshake completes after Noise message 2; there is no message
 * 3 (ACK).
 *
 * @param {OcapnSessionCryptographyOptions} options - Configuration options
 * @returns {OcapnSessionCryptography} The cryptography instance
 */
export const makeOcapnSessionCryptography = ({
  wasmModule,
  getRandomValues,
  signingKeys = undefined,
  supportedEncodings = [0],
}) => {
  let array;
  let buffer;

  const imports = {
    env: {
      __getrandom_custom: (at, length) => {
        if (!array || array.detached) {
          array = new Uint8Array(wasmInstance.exports.memory.buffer);
        }
        getRandomValues(array.subarray(at, at + length));
      },
      buffer_callback: bufferOffset => {
        const detached = !array || array.detached;
        if (detached) {
          array = new Uint8Array(wasmInstance.exports.memory.buffer);
        }
        if (!buffer || detached) {
          buffer = array.subarray(bufferOffset, bufferOffset + 65535);
        }
      },
    },
  };

  /** @type {any} */
  const wasmInstance = new WebAssembly.Instance(wasmModule, imports);

  /**
   * Snapshot the post-handshake hash from the WASM buffer into a fresh
   * `Uint8Array` that survives later buffer mutations.
   * @returns {Uint8Array}
   */
  const readHandshakeHash = () =>
    buffer.slice(
      HANDSHAKE_HASH_OFFSET,
      HANDSHAKE_HASH_OFFSET + HANDSHAKE_HASH_LENGTH,
    );

  /**
   * Creates an initiator instance for the handshake.
   *
   * @returns {InitiatorResult} The initiator instance with signing keys and SYN function
   */
  const asInitiator = () => {
    wasmInstance.exports.buffer();
    if (signingKeys) {
      buffer
        .subarray(SIGNING_KEY_OFFSET, SIGNING_KEY_OFFSET + SIGNING_KEY_LENGTH)
        .set(signingKeys.privateKey);
      buffer
        .subarray(
          INITIATOR_VERIFYING_KEY_OFFSET,
          INITIATOR_VERIFYING_KEY_OFFSET + VERIFYING_KEY_LENGTH,
        )
        .set(signingKeys.publicKey);
    } else {
      wasmInstance.exports.generate_initiator_keys();
      const privateKey = buffer.slice(
        SIGNING_KEY_OFFSET,
        SIGNING_KEY_OFFSET + SIGNING_KEY_LENGTH,
      );
      const publicKey = buffer.slice(
        INITIATOR_VERIFYING_KEY_OFFSET,
        INITIATOR_VERIFYING_KEY_OFFSET + VERIFYING_KEY_LENGTH,
      );
      signingKeys = { privateKey, publicKey };
    }

    // The encoding-negotiation bytes live inside the (encrypted) SYN
    // payload at offset 160; place them now so write_message picks
    // them up.
    encodeSupportedEncodingsInto(
      buffer.subarray(FIRST_ENCODING_OFFSET, FIRST_ENCODING_OFFSET + 4),
      supportedEncodings,
    );

    return harden({
      signingKeys,
      initiatorWriteSyn,
    });
  };

  /**
   * Creates a responder instance for the handshake.
   *
   * @returns {ResponderResult} The responder instance
   */
  const asResponder = () => {
    if (signingKeys) {
      wasmInstance.exports.buffer();
      buffer
        .subarray(SIGNING_KEY_OFFSET, SIGNING_KEY_OFFSET + SIGNING_KEY_LENGTH)
        .set(signingKeys.privateKey);
      // For IK the responder's verifying key sits at INTENDED_RESPONDER_KEY
      // (the routing slot the initiator dialed against).  The Rust side
      // recomputes it from the seed and asserts equality, so this copy
      // is the JS-side ground truth for both directions.
      buffer
        .subarray(
          INTENDED_RESPONDER_KEY_OFFSET,
          INTENDED_RESPONDER_KEY_OFFSET + INTENDED_RESPONDER_KEY_LENGTH,
        )
        .set(signingKeys.publicKey);
    } else {
      wasmInstance.exports.generate_responder_keys();
      const privateKey = buffer.slice(
        SIGNING_KEY_OFFSET,
        SIGNING_KEY_OFFSET + SIGNING_KEY_LENGTH,
      );
      const publicKey = buffer.slice(
        INTENDED_RESPONDER_KEY_OFFSET,
        INTENDED_RESPONDER_KEY_OFFSET + INTENDED_RESPONDER_KEY_LENGTH,
      );
      signingKeys = { privateKey, publicKey };
    }
    return harden({
      signingKeys,
      responderReadSynWriteSynack,
    });
  };

  /**
   * Writes the prefixed SYN message for the initiator.
   * The prefixed SYN includes the intended responder's public key in cleartext
   * followed by the encrypted Noise-IK SYN message, enabling relay routing.
   *
   * @param {Uint8Array} intendedResponderKey - The responder's ed25519 verifying key (32 bytes)
   * @param {Uint8Array} prefixedSyn - Buffer to write the prefixed SYN message to (must be PREFIXED_SYN_LENGTH bytes)
   * @returns {InitiatorWriteSynResult} Result containing the next handshake function
   * @throws {Error} If SYN message cannot be written
   */
  const initiatorWriteSyn = (intendedResponderKey, prefixedSyn) => {
    buffer
      .subarray(
        INTENDED_RESPONDER_KEY_OFFSET,
        INTENDED_RESPONDER_KEY_OFFSET + INTENDED_RESPONDER_KEY_LENGTH,
      )
      .set(intendedResponderKey);

    const code = wasmInstance.exports.initiator_write_syn();
    if (code === 1) {
      throw new Error(
        "OCapN Noise Protocol could not load initiator's ed25519 signing key",
      );
    } else if (code === 2) {
      throw new Error(
        "OCapN Noise Protocol could not derive initiator's static x25519 keypair",
      );
    } else if (code === 3) {
      throw new Error(
        'OCapN Noise Protocol intended responder key is not a valid ed25519 verifying key',
      );
    } else if (code === 4) {
      throw new Error(
        "OCapN Noise Protocol could not write initiator's SYN message",
      );
    }

    prefixedSyn
      .subarray(0, INTENDED_RESPONDER_KEY_LENGTH)
      .set(intendedResponderKey);
    prefixedSyn
      .subarray(
        INTENDED_RESPONDER_KEY_LENGTH,
        INTENDED_RESPONDER_KEY_LENGTH + SYN_LENGTH,
      )
      .set(buffer.subarray(SYN_OFFSET, SYN_OFFSET + SYN_LENGTH));

    return harden({ initiatorReadSynack });
  };

  /**
   * Reads the prefixed SYN message and writes the SYNACK message for
   * the responder.  The Noise IK handshake completes after this call;
   * subsequent reads/writes use `encrypt`/`decrypt` directly.
   *
   * @param {Uint8Array} prefixedSyn - The prefixed SYN message from the initiator (PREFIXED_SYN_LENGTH bytes)
   * @param {Uint8Array} synack - Buffer to write the SYNACK message to (must be SYNACK_LENGTH bytes)
   * @returns {ResponderReadSynWriteSynackResult} The initiator's verifying key, negotiated encoding, ciphers, and handshake hash
   */
  const responderReadSynWriteSynack = (prefixedSyn, synack) => {
    buffer
      .subarray(
        INTENDED_RESPONDER_KEY_OFFSET,
        INTENDED_RESPONDER_KEY_OFFSET + INTENDED_RESPONDER_KEY_LENGTH,
      )
      .set(prefixedSyn.subarray(0, INTENDED_RESPONDER_KEY_LENGTH));
    buffer
      .subarray(SYN_OFFSET, SYN_OFFSET + SYN_LENGTH)
      .set(
        prefixedSyn.subarray(
          INTENDED_RESPONDER_KEY_LENGTH,
          INTENDED_RESPONDER_KEY_LENGTH + SYN_LENGTH,
        ),
      );

    // Step 1: read msg 1.  Decrypts the SYN payload into BUFFER so we
    // can read the initiator's encoding offers below.
    const readCode = wasmInstance.exports.responder_read_syn();
    if (readCode === 1) {
      throw new Error(
        "OCapN Noise Protocol could not load responder's ed25519 signing key",
      );
    } else if (readCode === 2) {
      throw new Error(
        "OCapN Noise Protocol could not derive responder's static x25519 keypair",
      );
    } else if (readCode === 3) {
      throw new Error(
        'OCapN Noise Protocol SYN intended for different responder',
      );
    } else if (readCode === 4) {
      throw new Error(
        "OCapN Noise Protocol responder cannot read initiator's SYN message",
      );
    }

    // Negotiate against the initiator's freshly-decrypted offer set.
    const initiatorSupportedEncodings = decodeSupportedEncodingsFrom(
      buffer.subarray(FIRST_ENCODING_OFFSET, FIRST_ENCODING_OFFSET + 4),
    );
    let acceptedEncoding;
    for (const encoding of initiatorSupportedEncodings.reverse()) {
      if (supportedEncodings.includes(encoding)) {
        acceptedEncoding = encoding;
        break;
      }
    }
    if (acceptedEncoding === undefined) {
      throw new Error(
        `OCapN Noise Protocol no mutually supported encoding versions. Responder supports ${supportedEncodings.join(', ')}; initiator supports ${initiatorSupportedEncodings.join(', ')}`,
      );
    }
    if (acceptedEncoding > 255) {
      throw new Error(
        `OCapN Noise Protocol negotiated encoding ${acceptedEncoding} exceeds the SYNACK payload's 1-byte field`,
      );
    }
    buffer[ACCEPTED_ENCODING_OFFSET] = acceptedEncoding;

    // Step 2: write msg 2 with the negotiated encoding byte in place.
    const writeCode = wasmInstance.exports.responder_write_synack();
    if (writeCode === 1) {
      throw new Error(
        'Failed invariant: OCapN Noise Protocol responder handshake not initialized',
      );
    } else if (writeCode === 2) {
      throw new Error(
        'OCapN Noise Protocol responder cannot write SYNACK message',
      );
    } else if (writeCode === 3) {
      throw new Error(
        'Failed invariant: OCapN Noise Protocol responder handshake did not complete after msg 2',
      );
    }

    synack.set(buffer.subarray(SYNACK_OFFSET, SYNACK_OFFSET + SYNACK_LENGTH));
    const initiatorVerifyingKey = buffer.slice(
      INITIATOR_VERIFYING_KEY_OFFSET,
      INITIATOR_VERIFYING_KEY_OFFSET + VERIFYING_KEY_LENGTH,
    );
    const handshakeHash = readHandshakeHash();

    return harden({
      initiatorVerifyingKey,
      encoding: acceptedEncoding,
      encrypt,
      decrypt,
      handshakeHash,
    });
  };

  /**
   * Reads the SYNACK message and finalizes the handshake for the
   * initiator.  No further wire message follows.
   *
   * @param {Uint8Array} synack - The SYNACK message from the responder (SYNACK_LENGTH bytes)
   * @returns {InitiatorReadSynackResult} The negotiated encoding, ciphers, and handshake hash
   */
  const initiatorReadSynack = synack => {
    buffer.subarray(SYNACK_OFFSET, SYNACK_OFFSET + SYNACK_LENGTH).set(synack);
    const code = wasmInstance.exports.initiator_read_synack();
    if (code === 1) {
      throw new Error(
        'Failed invariant: OCapN Noise Protocol initiator handshake not initialized',
      );
    } else if (code === 2) {
      throw new Error(
        "OCapN Noise Protocol initiator cannot read responder's SYNACK message",
      );
    }

    const encoding = buffer[ACCEPTED_ENCODING_OFFSET];
    const handshakeHash = readHandshakeHash();
    return harden({
      encoding,
      encrypt,
      decrypt,
      handshakeHash,
    });
  };

  /**
   * Encrypts a message using the established session keys.
   *
   * @param {Uint8Array} message - The message to encrypt (max length: 65535 - 16 bytes)
   * @returns {Uint8Array} The encrypted message (original length + 16 bytes for authentication tag)
   * @throws {Error} If message is too long or encryption is not available
   */
  const encrypt = message => {
    if (message.length > 65535 - 16) {
      throw new Error(
        'OCapN Noise Protocol message exceeds maximum length for encryption',
      );
    }
    buffer.subarray(0, message.length).set(message);
    /** @type {number} */
    const code = wasmInstance.exports.encrypt(message.length);
    if (code === 1) {
      throw new Error(
        'Failed invariant: OCapN Noise Protocol encryption not available',
      );
    }
    return buffer.slice(0, message.length + 16);
  };

  /**
   * Decrypts a message using the established session keys.
   *
   * @param {Uint8Array} message - The encrypted message to decrypt (min length: 16 bytes, max length: 65535 bytes)
   * @returns {Uint8Array} The decrypted message (original length - 16 bytes for authentication tag)
   * @throws {Error} If message is too short, too long, decryption fails, or decryption is not available
   */
  const decrypt = message => {
    if (message.length < 16) {
      throw new Error(
        'OCapN Noise Protocol message not long enough for decryption',
      );
    }
    if (message.length > 65535) {
      throw new Error(
        'OCapN Noise Protocol message exceeds maximum length for decryption',
      );
    }
    buffer.subarray(0, message.length).set(message);
    /** @type {number} */
    const code = wasmInstance.exports.decrypt(message.length);
    if (code === 1) {
      throw new Error(
        'Failed invariant: OCapN Noise Protocol decryption not available',
      );
    }
    if (code === 2) {
      throw new Error('OCapN Noise Protocol decryption failed');
    }
    return buffer.slice(0, message.length - 16);
  };

  return harden({
    asInitiator,
    asResponder,
  });
};
