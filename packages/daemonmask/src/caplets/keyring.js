import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { TransactionFactory } from '@ethereumjs/tx';
import HdKeyring from "@metamask/eth-hd-keyring";

/** @import { TxData } from '@ethereumjs/tx' */

/**
 * Converts a `Buffer` into a `0x`-prefixed hex `String`.
 * @param buf {Buffer} object to convert
 */
const bufferToHex = function (buf) {
  return '0x' + buf.toString('hex')
}

export const make = () => {
  /** @type {InstanceType<typeof HdKeyring>} */
  let keyring;
  /** @type {string} */
  let address;

  const assertIsInitialized = () => {
    if (keyring === undefined) throw new Error('Keyring must be initialized first.');
  }

  return makeExo(
    'Keyring',
    M.interface('Keyring', {}, { defaultGuards: 'passable' }),
    {
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

      /** @param {TxData} txData */
      async signTransaction(txData) {
        assertIsInitialized();
        const tx = TransactionFactory.fromTxData(txData);
        const signedTx = await keyring.signTransaction(address, tx);
        return bufferToHex(signedTx.serialize());
      }
    },
  );
}
