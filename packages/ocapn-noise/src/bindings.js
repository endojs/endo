/* eslint-disable no-use-before-define */

export const makeOcapnSessionCryptography = ({
  wasmModule,
  getRandomValues,
}) => {
  let array;
  let buffer;
  let genkeyPrivate;
  let genkeyPublic;
  let errorMessage;

  const imports = {
    env: {
      __getrandom_custom: (at, length) => {
        if (!array || array.detached) {
          array = new Uint8Array(wasmInstance.exports.memory.buffer);
        }
        getRandomValues(array.subarray(at, at + length));
      },
      genkey_callback: (privateOffset, publicOffset) => {
        if (!array || array.detached) {
          array = new Uint8Array(wasmInstance.exports.memory.buffer);
        }
        genkeyPrivate = array.slice(privateOffset, privateOffset + 32);
        genkeyPublic = array.slice(publicOffset, publicOffset + 32);
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
      error_callback: (errorOffset, errorLength) => {
        const messageBytes = new Uint8Array(
          wasmInstance.exports.memory.buffer,
        ).subarray(errorOffset, errorOffset + errorLength);
        errorMessage = new TextDecoder().decode(messageBytes);
      },
    },
  };

  /** @type {any} */
  const wasmInstance = new WebAssembly.Instance(wasmModule, imports);

  const refreshBuffer = () => {
    wasmInstance.exports.buffer();
  };

  const randomKeys = () => {
    wasmInstance.exports.genkey();
    return {
      privateKey: genkeyPrivate,
      publicKey: genkeyPublic,
    };
  };

  const syn = (privateKey, publicKey) => {
    errorMessage = '';
    refreshBuffer();
    buffer.subarray(0, 32).set(privateKey);
    buffer.subarray(32, 64).set(publicKey);
    const code = wasmInstance.exports.syn();
    if (code === 1) {
      throw new Error(
        `Could not write Noise Protocol initiator's message: ${errorMessage}`,
      );
    }
    refreshBuffer();
    return buffer.slice(64, 64 + 96);
  };

  const synack = (privateKey, synMessage) => {
    errorMessage = '';
    refreshBuffer();
    buffer.subarray(0, 32).set(privateKey);
    buffer.subarray(32, 32 + 96).set(synMessage);
    const code = wasmInstance.exports.synack();
    if (code === 1) {
      throw new Error(
        `Could not read initiator's Noise Protocol message: ${errorMessage}`,
      );
    } else if (code === 2) {
      throw new Error(`Could not read initiator's Noise Protocol public key`);
    } else if (code === 3) {
      throw new Error(
        `Could not write responder's Noise Protocol message: ${errorMessage}`,
      );
    }
    refreshBuffer();
    const publicKey = buffer.slice(32 + 96, 32 + 96 + 32);
    const message = buffer.slice(32 + 96 + 32, 32 + 96 + 32 + 48);
    return { publicKey, message };
  };

  const ack = synackMessage => {
    errorMessage = '';
    refreshBuffer();
    buffer.subarray(0, 48).set(synackMessage);
    const code = wasmInstance.exports.ack();
    if (code === 1) {
      throw new Error(
        `Could not finish unstarted Noise Protocol handshake: ${errorMessage}`,
      );
    } else if (code === 2) {
      throw new Error(
        `Could not read initiator's Noise Protocol message: ${errorMessage}`,
      );
    }
  };

  const encrypt = message => {
    errorMessage = '';
    refreshBuffer();
    buffer.subarray(0, message.length).set(message);
    /** @type {number} */
    const resultLength = wasmInstance.exports.encrypt(message.length);
    if (resultLength < 0) {
      throw new Error(`Encrypt error: ${resultLength}`);
    }
    refreshBuffer();
    return buffer.slice(0, resultLength);
  };

  const decrypt = message => {
    errorMessage = '';
    refreshBuffer();
    buffer.subarray(0, message.length).set(message);
    /** @type {number} */
    const resultLength = wasmInstance.exports.decrypt(message.length);
    if (resultLength < 0) {
      throw new Error(`Decrypt error: ${resultLength}`);
    }
    refreshBuffer();
    return buffer.slice(0, resultLength);
  };

  return { randomKeys, syn, synack, ack, encrypt, decrypt };
};
