// @ts-check

const { freeze } = Object;

// XXX: what hazards may not using endo assert.fail expose us to?
export const fail = reason => {
  throw Error(reason);
};
freeze(fail);

/**
 * Dynamic access
 *
 * @template {Record<string, any>} T
 * @param {Partial<T>} io
 * @returns {T}
 */
const dyn = io => {
  const it = new Proxy(io, {
    get(_t, p) {
      if (!(p in io)) {
        return () => fail(`no access to ${String(p)}`);
      }
      // @ts-expect-error tsc doesn't refine per p in o
      return io[p];
    },
  });
  return /** @type {T} */ (it);
};

/**
 * @template [T=any]
 * @typedef {{
 *   join(...segments: string[]): T;
 *   toString: () => string;
 *   basename: () => string;
 *   relative(to: string): string;
 * }} PathNode
 *
 * XXX how to test / assert / declare that FileRd and FileWR extend PathNode?
 * interfaces?
 */

/**
 * @typedef {ReturnType<typeof makeFileRd>} FileRd
 */

/**
 * Reify file read access as an object.
 *
 * @param {string} root
 * @param {object} [io]
 * @param {Partial<typeof import('fs')>} [io.fs]
 * @param {Partial<typeof import('fs/promises')>} [io.fsp]
 * @param {Partial<typeof import('path')>} [io.path]
 */
export const makeFileRd = (root, { fs = {}, fsp = {}, path = {} } = {}) => {
  const [fsio, fspio, pathio] = [dyn(fs), dyn(fsp), dyn(path)];

  /** @param {string} there */
  const make = there => {
    const self = {
      toString: () => there,
      /** @param {string[]} segments */
      join: (...segments) => make(pathio.join(there, ...segments)),
      /** @param {string} to */
      relative: to => pathio.relative(there, to),
      stat: () => fspio.stat(there),
      readText: () => fspio.readFile(there, 'utf8'),
      readJSON: () => self.readText().then(txt => JSON.parse(txt)),
      /** @param {string} [suffix] */
      basename: suffix => pathio.basename(there, suffix),
      existsSync: () => fsio.existsSync(there),
      /** @returns {Promise<FileRd[]>} */
      readdir: () =>
        fspio
          .readdir(there)
          .then(files => files.map(segment => self.join(segment))),
    };
    return freeze(self);
  };
  return make(root);
};
freeze(makeFileRd);

/**
 * Reify file read/write access as an object.
 *
 * @param {string} root
 * @param {object} [io]
 * @param {Partial<typeof import('fs')>} [io.fs]
 * @param {Partial<typeof import('fs/promises')>} [io.fsp]
 * @param {Partial<typeof import('path')>} [io.path]
 *
 * @typedef {ReturnType<typeof makeFileRW>} FileRW
 */
export const makeFileRW = (root, { fs = {}, fsp = {}, path = {} } = {}) => {
  // XXX share dyn with makeFileRd?
  const [fspio, pathio] = [dyn(fsp), dyn(path)];

  /** @param {string} there */
  const make = there => {
    const ro = makeFileRd(there, { fs, fsp, path });
    const self = {
      toString: () => there,
      readOnly: () => ro,
      /** @param {string[]} segments */
      join: (...segments) => make(pathio.join(there, ...segments)),
      writeText: text => fspio.writeFile(there, text, 'utf8'),
      unlink: () => fspio.unlink(there),
      mkdir: () => fspio.mkdir(there, { recursive: true }),
      rmdir: () => fspio.rmdir(there),
    };
    return freeze(self);
  };
  return make(root);
};
freeze(makeFileRW);
