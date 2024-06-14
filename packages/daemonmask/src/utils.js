import { M } from '@endo/patterns';

export const names = {
  BUNDLER: 'bundler',
  KEYRING: 'keyring',
};

/**
 * @param {string} name
 */
export const getExoInterface = (name) =>
  M.interface(name, {}, { defaultGuards: 'passable' });
