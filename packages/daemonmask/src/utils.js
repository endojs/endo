import { makeExo as _makeExo } from '@endo/exo';
import { M } from '@endo/patterns';

export const Name = {
  Bundler: 'bundler',
  Keyring: 'keyring',
  Provider: 'provider',
  Transactions: 'transactions',
  Wallet: 'wallet',
};

export const TxStatus = {
  Submitted: 'submitted',
  Completed: 'completed',
  Orphaned: 'orphaned',
};

/**
 * @param {string} name
 * @param {Record<string, unknown>} value
 */
export const makeExo = (name, value) =>
  _makeExo(
    name,
    M.interface(name, {}, { defaultGuards: 'passable' }),
    // @ts-expect-error We're gonna live with this one
    value,
  );

/**
 * @param {unknown} value
 * @returns {value is Record<string | number, unknown>}
 */
export const isObject = (value) => Boolean(value) && typeof value === 'object';

export const makeIdGenerator = () => {
  let id = 0;
  // eslint-disable-next-line no-plusplus
  return () => String(id++);
};

/** @param {string | number | bigint} decimalValue */
export const decimalToHex = (decimalValue) => {
  return `0x${decimalValue.toString(16)}`;
};

/** @param {string} decimalEth */
export const decimalEthToHexWei = (decimalEth) => {
  return decimalToHex(BigInt(parseInt(decimalEth, 10)) * BigInt(1e18));
};

/**
 * Converts hexadecimal Wei value to decimal Wei string.
 * @param {string} hexWei - The hexadecimal representation of Wei.
 * @returns {string} The decimal string representation of Wei.
 */
export const hexWeiToDecimalWei = (hexWei) => {
  const decimalWei = BigInt(hexWei);
  return decimalWei.toString();
};

/**
 * Converts hexadecimal Wei value to decimal Ether string.
 * Assumes 1 Ether = 10^18 Wei.
 * @param {string} hexWei - The hexadecimal representation of Wei.
 * @returns {string} The decimal string representation of Ether.
 */
export const hexWeiToDecimalEth = (hexWei) => {
  const decimalWei = BigInt(hexWei);
  // Divide by 10^18 to convert Wei to ETH
  const ethValue = decimalWei / BigInt('1000000000000000000');
  return ethValue.toString();
};
