import { makeExo as _makeExo } from '@endo/exo';
import { M } from '@endo/patterns';

export const names = {
  BUNDLER: 'bundler',
  KEYRING: 'keyring',
  PROVIDER: 'provider',
  TRANSACTIONS: 'transactions',
  WALLET: 'wallet',
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
