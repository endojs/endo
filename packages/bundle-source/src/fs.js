/**
 * @param {string} fileName
 * @param {{
 *   fs: {
 *     promises: Pick<import('fs/promises'),'readFile' | 'stat'>
 *   },
 *   path: Pick<import('path'), 'resolve' | 'relative' | 'normalize'>,
 * }} powers
 */
export const makeFileReader = (fileName, { fs, path }) => {
  const make = there => makeFileReader(there, { fs, path });

  // fs.promises.exists isn't implemented in Node.js apparently because it's pure
  // sugar.
  const exists = fn =>
    fs.promises.stat(fn).then(
      () => true,
      e => {
        if (e.code === 'ENOENT') {
          return false;
        }
        throw e;
      },
    );

  const readText = () => fs.promises.readFile(fileName, 'utf-8');

  const maybeReadText = () =>
    readText().catch(error => {
      if (
        error.message.startsWith('ENOENT: ') ||
        error.message.startsWith('EISDIR: ')
      ) {
        return undefined;
      }
      throw error;
    });

  return harden({
    toString: () => fileName,
    readText,
    maybeReadText,
    neighbor: ref => make(path.resolve(fileName, ref)),
    stat: () => fs.promises.stat(fileName),
    absolute: () => path.normalize(fileName),
    relative: there => path.relative(fileName, there),
    exists: () => exists(fileName),
  });
};

/**
 * @param {string} fileName
 * @param {{
 *   fs: Pick<import('fs'), 'existsSync'> &
 *     { promises: Pick<
 *         import('fs/promises'),
 *         'readFile' | 'stat' | 'writeFile' | 'mkdir' | 'rm'
 *       >,
 *     },
 *   path: Pick<import('path'), 'resolve' | 'relative' | 'normalize'>,
 * }} io
 * @param {number} pid
 */
export const makeFileWriter = (fileName, { fs, path }, pid) => {
  const make = there => makeFileWriter(there, { fs, path }, pid);
  return harden({
    toString: () => fileName,
    writeText: (txt, opts) => fs.promises.writeFile(fileName, txt, opts),
    atomicWriteText: async (txt, opts) => {
      const scratchName = `${fileName}.${pid}.scratch`;
      await fs.promises.writeFile(scratchName, txt, opts);
      const stats = await fs.promises.stat(scratchName);
      await fs.promises.rename(scratchName, fileName);
      return stats;
    },
    readOnly: () => makeFileReader(fileName, { fs, path }),
    neighbor: ref => make(path.resolve(fileName, ref)),
    mkdir: opts => fs.promises.mkdir(fileName, opts),
    rm: opts => fs.promises.rm(fileName, opts),
  });
};
