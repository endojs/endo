/* eslint-disable no-use-before-define */

/**
 * @typedef {object} SigningKeys
 * @property {Uint8Array} privateKey - The ed25519 private signing key (32 bytes)
 * @property {Uint8Array} publicKey - The ed25519 public verifying key (32 bytes)
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
 * @property {(syn: Uint8Array) => InitiatorWriteSynResult} initiatorWriteSyn - Function to write SYN message
 */

/**
 * @typedef {object} ResponderResult
 * @property {SigningKeys} signingKeys - The generated or provided signing keys
 * @property {(syn: Uint8Array, synack: Uint8Array) => ResponderReadSynWriteSynackResult} responderReadSynWriteSynack - Function to read SYN and write SYNACK
 */

/**
 * @typedef {object} InitiatorWriteSynResult
 * @property {(synack: Uint8Array, ack: Uint8Array) => InitiatorReadSynackWriteAckResult} initiatorReadSynackWriteAck - Function to read SYNACK and write ACK
 */

/**
 * @typedef {object} ResponderReadSynWriteSynackResult
 * @property {Uint8Array} initiatorVerifyingKey - The initiator's public verifying key (32 bytes)
 * @property {(ack: Uint8Array) => ResponderReadAckResult} responderReadAck - Function to read ACK message
 */

/**
 * @typedef {object} InitiatorReadSynackWriteAckResult
 * @property {number} encoding - The negotiated encoding version
 * @property {(message: Uint8Array) => Uint8Array} encrypt - Function to encrypt messages
 * @property {(message: Uint8Array) => Uint8Array} decrypt - Function to decrypt messages
 */

/**
 * @typedef {object} ResponderReadAckResult
 * @property {number} encoding - The negotiated encoding version
 * @property {(message: Uint8Array) => Uint8Array} encrypt - Function to encrypt messages
 * @property {(message: Uint8Array) => Uint8Array} decrypt - Function to decrypt messages
 */

/**
 * @typedef {object} OcapnSessionCryptography
 * @property {() => InitiatorResult} asInitiator - Create an initiator instance
 * @property {() => ResponderResult} asResponder - Create a responder instance
 */

// const PRIVATE_CRYPT_KEY_OFFSET = 0;
// const PRIVATE_CRYPT_KEY_LENGTH = 32;
// const PUBLIC_CRYPT_KEY_OFFSET = 32;
// const PUBLIC_CRYPT_KEY_LENGTH = 32;
const SIGNING_KEY_OFFSET = 64;
const SIGNING_KEY_LENGTH = 32;
const INITIATOR_VERIFYING_KEY_OFFSET = 128;
const VERIFYING_KEY_LENGTH = 32;
// const INITIATOR_SIGNATURE_OFFSET = 160;
// const SIGNATURE_LENGTH = 64;
const FIRST_ENCODING_OFFSET = 224;
// const OTHER_ENCODINGS_OFFSET = 226;
// const SYN_PAYLOAD_OFFSET = 128;
const SYN_PAYLOAD_LENGTH = 100;
const SYN_OFFSET = 256;
export const SYN_LENGTH = 32 + SYN_PAYLOAD_LENGTH;
// const SYNACK_PAYLOAD_OFFSET = 416;
const SYNACK_PAYLOAD_LENGTH = 97;
const SYNACK_OFFSET = 544;
export const SYNACK_LENGTH = 96 + SYNACK_PAYLOAD_LENGTH; // 129
const RESPONDER_VERIFYING_KEY_OFFSET = 416;
// const RESPONDER_SIGNATURE_OFFSET = 448;
const ACCEPTED_ENCODING_OFFSET = 512;
const ACK_OFFSET = 768;
export const ACK_LENGTH = 64;

/**
 * Encodes supported encoding versions into a buffer for transmission.
 *
 * @param {Uint8Array} bytes - The view to write to (must be at least 2 bytes)
 * @param {number[]} supportedEncodings - Array of supported encoding versions (1-9 versions, each 0-65536)
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
   * Creates an initiator instance for the handshake.
   *
   * @returns {InitiatorResult} The initiator instance with signing keys and SYN function
   */
  const asInitiator = () => {
    wasmInstance.exports.buffer();
    encodeSupportedEncodingsInto(
      buffer.subarray(FIRST_ENCODING_OFFSET, FIRST_ENCODING_OFFSET + 2),
      supportedEncodings,
    );
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

    return {
      signingKeys,
      initiatorWriteSyn,
    };
  };

  /**
   * Creates a responder instance for the handshake.
   *
   * @returns {ResponderResult} The responder instance with signing keys and SYN/SYNACK function
   */
  const asResponder = () => {
    if (signingKeys) {
      wasmInstance.exports.buffer();
      buffer
        .subarray(SIGNING_KEY_OFFSET, SIGNING_KEY_OFFSET + SIGNING_KEY_LENGTH)
        .set(signingKeys.privateKey);
      buffer
        .subarray(
          RESPONDER_VERIFYING_KEY_OFFSET,
          RESPONDER_VERIFYING_KEY_OFFSET + VERIFYING_KEY_LENGTH,
        )
        .set(signingKeys.publicKey);
    } else {
      wasmInstance.exports.generate_responder_keys();
      const privateKey = buffer.slice(
        SIGNING_KEY_OFFSET,
        SIGNING_KEY_OFFSET + SIGNING_KEY_LENGTH,
      );
      const publicKey = buffer.slice(
        RESPONDER_VERIFYING_KEY_OFFSET,
        RESPONDER_VERIFYING_KEY_OFFSET + VERIFYING_KEY_LENGTH,
      );
      signingKeys = { privateKey, publicKey };
    }
    return {
      signingKeys,
      responderReadSynWriteSynack,
    };
  };

  /**
   * Writes the SYN message for the initiator.
   *
   * @param {Uint8Array} syn - Buffer to write the SYN message to (must be SYN_LENGTH bytes)
   * @returns {InitiatorWriteSynResult} Result containing the next handshake function
   * @throws {Error} If SYN message cannot be written
   */
  const initiatorWriteSyn = syn => {
    const code = wasmInstance.exports.initiator_write_syn();
    if (code === 1) {
      throw new Error(
        `OCapN Noise Protocol could not write initiator's SYN message`,
      );
    }
    syn.set(buffer.subarray(SYN_OFFSET, SYN_OFFSET + SYN_LENGTH));

    return { initiatorReadSynackWriteAck };
  };

  /**
   * Reads the SYN message and writes the SYNACK message for the responder.
   *
   * @param {Uint8Array} syn - The SYN message from the initiator
   * @param {Uint8Array} synack - Buffer to write the SYNACK message to (must be SYNACK_LENGTH bytes)
   * @returns {ResponderReadSynWriteSynackResult} Result containing initiator's key, accepted encoding, and next function
   * @throws {Error} If SYN message is invalid, signature verification fails, or no mutually supported encodings
   */
  const responderReadSynWriteSynack = (syn, synack) => {
    buffer.subarray(SYN_OFFSET, SYN_OFFSET + SYN_LENGTH).set(syn);
    let code = wasmInstance.exports.responder_read_syn();
    if (code === 1) {
      throw new Error(
        "OCapN Noise Protocol responder cannot read initiator's ed25519 signing key",
      );
    } else if (code === 2) {
      throw new Error(
        "OCapN Noise Protocol responder cannot read initiator's SYN message",
      );
    } else if (code === 3) {
      throw new Error(
        "OCapN Noise Protocol responder cannot get initiator's static x25519 encryption key",
      );
    } else if (code === 4) {
      throw new Error(
        "OCapN Noise Protocol responder cannot read initiator's ed25519 signature of their x25519 encryption key",
      );
    } else if (code === 5) {
      throw new Error(
        "OCapN Noise Protocol responder cannot read initiator's ed25519 purported public verifying key",
      );
    } else if (code === 6) {
      throw new Error(
        "OCapN Noise Protocol initiator's purported ed25519 signature does not correspond to their actual x25519 public encryption key",
      );
    }

    const initiatorSupportedEncodings = decodeSupportedEncodingsFrom(
      buffer.subarray(FIRST_ENCODING_OFFSET, FIRST_ENCODING_OFFSET + 2),
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
    buffer[ACCEPTED_ENCODING_OFFSET] = acceptedEncoding;

    code = wasmInstance.exports.responder_write_synack();
    if (code === 1) {
      throw new Error(
        'Failed invariant: OCapN Noise Protocol responder handshake not initialized',
      );
    } else if (code === 2) {
      throw new Error(
        'OCapN Noise Protocol responder cannot write SYNACK message',
      );
    }

    synack.set(buffer.subarray(SYNACK_OFFSET, SYNACK_OFFSET + SYNACK_LENGTH));
    const initiatorVerifyingKey = buffer.slice(
      INITIATOR_VERIFYING_KEY_OFFSET,
      INITIATOR_VERIFYING_KEY_OFFSET + VERIFYING_KEY_LENGTH,
    );

    return {
      initiatorVerifyingKey,
      responderReadAck,
    };
  };

  /**
   * Reads the SYNACK message and writes the ACK message for the initiator.
   *
   * @param {Uint8Array} synack - The SYNACK message from the responder
   * @param {Uint8Array} ack - Buffer to write the ACK message to (must be ACK_LENGTH bytes)
   * @returns {InitiatorReadSynackWriteAckResult} Result containing negotiated encoding and encrypt/decrypt functions
   * @throws {Error} If SYNACK message is invalid, signature verification fails, or handshake not initialized
   */
  const initiatorReadSynackWriteAck = (synack, ack) => {
    {
      buffer.subarray(SYNACK_OFFSET).subarray(0, SYNACK_LENGTH).set(synack);
      const code = wasmInstance.exports.initiator_read_synack();
      if (code === 1) {
        throw new Error(
          `Failed invariant: OCapN Noise Protocol initiator handshake not initialized`,
        );
      } else if (code === 2) {
        throw new Error(
          `OCapN Noise Protocol initiator cannot read responder's ACK message`,
        );
      } else if (code === 3) {
        throw new Error(
          `Failed invariant: OCapN Noise Protocol initiator cannot get responder's static x25519 encryption key`,
        );
      } else if (code === 4) {
        throw new Error(
          `OCapN Noise Protocol initiator cannot read responder's ed25519 signature of their x25519 encryption key`,
        );
      } else if (code === 5) {
        throw new Error(
          `OCapN Noise Protocol initiator cannot read responder's ed25519 purported public verifying key`,
        );
      } else if (code === 6) {
        throw new Error(
          `OCapN Noise Protocol responder's purported ed25519 signature does not correpond to their actual x25519 public encryption key`,
        );
      }
    }
    {
      const code = wasmInstance.exports.initiator_write_ack();
      if (code === 1) {
        throw new Error(
          'Failed invariant: OCapN Noise Protocol initiator handshake not initialized',
        );
      } else if (code === 2) {
        throw new Error(
          'OCapN Noise Protocol initiator cannot write ACK message',
        );
      }
      ack.set(buffer.subarray(ACK_OFFSET).subarray(0, ACK_LENGTH));
    }
    const encoding = buffer[ACCEPTED_ENCODING_OFFSET];

    return {
      encoding,
      encrypt,
      decrypt,
    };
  };

  /**
   * Reads the ACK message for the responder to complete the handshake.
   *
   * @param {Uint8Array} ack - The ACK message from the initiator
   * @returns {ResponderReadAckResult} Result containing negotiated encoding and encrypt/decrypt functions
   * @throws {Error} If ACK message is invalid, signature verification fails, or handshake not initialized
   */
  const responderReadAck = ack => {
    {
      buffer.subarray(ACK_OFFSET).subarray(0, ACK_LENGTH).set(ack);
      const code = wasmInstance.exports.responder_read_ack();
      if (code === 1) {
        throw new Error(
          `Failed invariant: OCapN Noise Protocol responder handshake not initialized`,
        );
      } else if (code === 2) {
        throw new Error(
          `OCapN Noise Protocol responder cannot read initiator's ACK message`,
        );
      } else if (code === 3) {
        throw new Error(
          `Failed invariant: OCapN Noise Protocol responder cannot get initiator's static x25519 encryption key`,
        );
      } else if (code === 4) {
        throw new Error(
          `OCapN Noise Protocol responder cannot read initiator's ed25519 signature of their x25519 encryption key`,
        );
      } else if (code === 5) {
        throw new Error(
          `OCapN Noise Protocol responder cannot read initiator's ed25519 purported public verifying key`,
        );
      } else if (code === 6) {
        throw new Error(
          `OCapN Noise Protocol initiator's purported ed25519 signature does not correpond to their actual x25519 public encryption key`,
        );
      }
    }

    const encoding = buffer[ACCEPTED_ENCODING_OFFSET];

    return {
      encoding,
      encrypt,
      decrypt,
    };
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

  return {
    asInitiator,
    asResponder,
  };
};
