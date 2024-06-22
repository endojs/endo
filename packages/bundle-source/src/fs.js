// @ts-check
let mutex = Promise.resolve(undefined);

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

  const readText = async () => {
    const promise = mutex;
    let release = Function.prototype;
    mutex = new Promise(resolve => {
      release = resolve;
    });
    await promise;
    try {
      return await fs.promises.readFile(fileName, 'utf-8');
    } finally {
      release(undefined);
    }
  };

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
 *         'readFile' | 'stat' | 'writeFile' | 'mkdir' | 'rename' | 'rm'
 *       >,
 *     },
 *   path: Pick<import('path'), 'dirname' | 'resolve' | 'relative' | 'normalize'>,
 * }} io
 * @param {(there: string) => ReturnType<makeFileWriter>} make
 */
export const makeFileWriter = (
  fileName,
  { fs, path },
  make = there => makeFileWriter(there, { fs, path }, make),
) => {
  const writeText = async (txt, opts) => {
    const promise = mutex;
    let release = Function.prototype;
    mutex = new Promise(resolve => {
      release = resolve;
    });
    await promise;
    try {
      return await fs.promises.writeFile(fileName, txt, opts);
    } finally {
      release(undefined);
    }
  };

  return harden({
    toString: () => fileName,
    writeText,
    readOnly: () => makeFileReader(fileName, { fs, path }),
    neighbor: ref => make(path.resolve(fileName, ref)),
    mkdir: opts => fs.promises.mkdir(fileName, opts),
    rm: opts => fs.promises.rm(fileName, opts),
    rename: newName =>
      fs.promises.rename(
        fileName,
        path.resolve(path.dirname(fileName), newName),
      ),
  });
};

/**
 * @param {string} fileName
 * @param {{
 *   fs: Pick<import('fs'), 'existsSync'> &
 *     { promises: Pick<
 *         import('fs/promises'),
 *         'readFile' | 'stat' | 'writeFile' | 'mkdir' | 'rename' | 'rm'
 *       >,
 *     },
 *   path: Pick<import('path'), 'dirname' | 'resolve' | 'relative' | 'normalize'>,
 *   os: Pick<import('os'), 'platform'>,
 * }} io
 * @param {number} [pid]
 * @param {number} [nonce]
 * @param {(there: string) => ReturnType<makeAtomicFileWriter>} make
 */
export const makeAtomicFileWriter = (
  fileName,
  { fs, path, os },
  pid = undefined,
  nonce = undefined,
  make = there =>
    makeAtomicFileWriter(there, { fs, path, os }, pid, nonce, make),
) => {
  const writer = makeFileWriter(fileName, { fs, path }, make);

  // Windows does not support atomic rename so we do the next best albeit racey
  // thing.
  if (os.platform() === 'win32') {
    return harden({
      ...writer,
      atomicWriteText: async (txt, opts) => {
        await writer.writeText(txt, opts);
        return writer.readOnly().stat();
      },
    });
  }

  return harden({
    ...writer,
    atomicWriteText: async (txt, opts) => {
      const scratchName = `${fileName}.${nonce || 'no-nonce'}.${
        pid || 'no-pid'
      }.scratch`;
      const scratchWriter = writer.neighbor(scratchName);
      await scratchWriter.writeText(txt, opts);
      const stats = await scratchWriter.readOnly().stat();
      await scratchWriter.rename(fileName);
      return stats;
    },
  });
};
