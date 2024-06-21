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
