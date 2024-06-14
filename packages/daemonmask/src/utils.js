import { makeExo as _makeExo } from '@endo/exo';
import { M } from '@endo/patterns';

export const names = {
  BUNDLER: 'bundler',
  KEYRING: 'keyring',
  PROVIDER: 'provider',
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
    // @ts-expect-error Can't bother getting this type right
    value,
  );
