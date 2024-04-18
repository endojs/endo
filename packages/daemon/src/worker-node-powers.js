// @ts-check

import { makeNodeReader, makeNodeWriter } from '@endo/stream-node';

/** @import { MignonicPowers } from './types.js' } */

/**
 * @param {object} modules
 * @param {typeof import('fs')} modules.fs
 * @param {typeof import('url')} modules.url
 * @returns {MignonicPowers}
 */
export const makePowers = ({ fs, url }) => {
  // @ts-ignore This is in fact how you open a file descriptor.
  const reader = makeNodeReader(fs.createReadStream(null, { fd: 3 }));
  // @ts-ignore This is in fact how you open a file descriptor.
  const writer = makeNodeWriter(fs.createWriteStream(null, { fd: 4 }));

  const connection = {
    reader,
    writer,
  };

  const { pathToFileURL } = url;

  return harden({
    connection,
    pathToFileURL: path => pathToFileURL(path).toString(),
  });
};
