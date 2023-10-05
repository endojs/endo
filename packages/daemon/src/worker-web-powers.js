// @ts-check

import { makeWebWorkerReader, makeWebWorkerWriter } from './daemon-web-powers.js';

/**
 * @param {object} modules
 * @param {typeof import('fs')} modules.fs
 * @param {typeof import('url')} modules.url
 * @returns {import('./types.js').MignonicPowers}
 */
export const makePowers = ({ url }) => {
  const reader = makeWebWorkerReader(globalThis);
  const writer = makeWebWorkerWriter(globalThis);

  const connection = {
    reader,
    writer,
  };

  const { pathToFileURL } = url;

  return harden({
    connection,
    pathToFileURL: path => {
      console.log(`pathToFileURL(${path})`);
      return pathToFileURL(path).toString();
    },
  });
};
