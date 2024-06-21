import { Common } from '@ethereumjs/common';
import { TransactionFactory } from '@ethereumjs/tx';
import HdKeyring from '@metamask/eth-hd-keyring';

import { makeExo } from '../utils.js';

/**
 * Converts a `Buffer` into a `0x`-prefixed hex `String`.
 * @param {Buffer} buffer - The buffer to convert.
 */
const bufferToHex = (buffer) => {
  return `0x${buffer.toString('hex')}`;
};

export const make = () => {
  /** @type {InstanceType<typeof HdKeyring>} */
  let keyring;
  /** @type {string} */
  let address;

  const assertIsInitialized = () => {
    if (keyring === undefined) {
      throw new Error('Keyring must be initialized first.');
    }
  };

  /** @param {string} otherAddress */
  const assertIsOurAddress = (otherAddress) => {
    const isOurAddress = address.toLowerCase() === otherAddress.toLowerCase();
    if (!isOurAddress) {
      throw new Error(`Unknown address: ${otherAddress}`);
    }
  };

  return makeExo('Keyring', {
    /** @param {string} mnemonic */
    init(mnemonic) {
      keyring = new HdKeyring({
        mnemonic,
        numberOfAccounts: 1,
      });

      // @ts-expect-error This will in fact be defined.
      address = keyring.getAccounts()[0];
    },

    getAddress() {
      return address;
    },

    /** @param {string} message */
    signMessage(message) {
      assertIsInitialized();
      return keyring.signMessage(address, message);
    },

    /**
     * @param {any} txData
     * @param {string} chainId
     */
    async signTransaction(txData, chainId) {
      assertIsInitialized();
      assertIsOurAddress(txData.from);

      const tx = TransactionFactory.fromTxData(txData, {
        common: Common.custom({ chainId: BigInt(chainId) }),
      });
      const signedTx = await keyring.signTransaction(address, tx);
      return bufferToHex(signedTx.serialize());
    },
  });
};
