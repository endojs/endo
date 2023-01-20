// @ts-check
/* global process */

import { makeNodeReader, makeNodeWriter } from '@endo/stream-node';

/**
 * @param {object} modules
 * @param {typeof import('fs')} modules.fs
 * @returns {import('./types.js').MignonicPowers}
 */
export const makePowers = ({ fs }) => {
  /** @param {Error} error */
  const exitOnError = error => {
    console.error(error);
    process.exit(-1);
  };

  // @ts-ignore This is in fact how you open a file descriptor.
  const reader = makeNodeReader(fs.createReadStream(null, { fd: 3 }));
  // @ts-ignore This is in fact how you open a file descriptor.
  const writer = makeNodeWriter(fs.createWriteStream(null, { fd: 4 }));

  const connection = {
    reader,
    writer,
  };

  return harden({
    exitOnError,
    connection,
  });
};
