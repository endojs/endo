// @ts-check

const { freeze } = Object;

/**
 * @import {PathNode, FileRd, FileRW} from './file.js';
 *
 * XXX TODO: basename, relative
 * @typedef {Omit<PathNode, 'basename' | 'relative'> & Pick<FileRd, 'readText' | 'readJSON'>} TextRd
 */

const dbg = label => x => {
  label;
  // console.log(label, x);
  return x;
};

/**
 *
 * @param {string} root
 * @param {object} io
 * @param {typeof fetch} io.fetch
 * @param {(...msgs: any[]) => void} [io.log]
 * @returns {TextRd}
 */
export const makeWebRd = (root, { fetch, log = console.log }) => {
  /** @param {string} there */
  const make = there => {
    /** @param {string[]} segments */
    const join = (...segments) => {
      dbg('web.join')({ there, segments });
      let out = there;
      for (const segment of segments) {
        out = `${new URL(segment, out)}`;
      }
      return out;
    };

    const checkedFetch = async () => {
      log('WebRd fetch:', there);
      const res = await fetch(there);
      if (!res.ok) {
        throw Error(`${res.statusText} @ ${there}`);
      }
      return res;
    };
    /** @type {TextRd} */
    const self = {
      toString: () => there,
      /** @param {string[]} segments */
      join: (...segments) => make(join(...segments)),
      readText: () => checkedFetch().then(res => res.text()),
      readJSON: () => checkedFetch().then(res => res.json()),
    };
    return freeze(self);
  };
  return make(root);
};
freeze(makeWebRd);

/**
 * @param {TextRd} src
 * @param {FileRW} dest
 *
 * @typedef {ReturnType<typeof makeWebCache>} WebCache
 */
export const makeWebCache = (src, dest) => {
  /** @type {Map<string, Promise<FileRd>>} */
  const saved = new Map();

  /** @param {string} segment */
  const getFileP = segment => {
    const target = src.join(segment);
    const addr = `${target}`;
    const cached = saved.get(addr);
    if (cached) return cached;

    const f = dest.join(segment);
    /** @type {Promise<FileRd>} */
    const p = new Promise((resolve, reject) =>
      target
        .readText()
        .then(txt =>
          dest
            .mkdir()
            .then(() => f.writeText(txt).then(_ => resolve(f.readOnly()))),
        )
        .catch(reject),
    );
    saved.set(addr, p);
    return p;
  };

  const remove = async () => {
    throw Error('TODO');
    // await Promise.all([...saved.values()].map(p => p.then(f => f.unlink())));
    // await dest.rmdir();
  };

  const self = {
    toString: () => `${src} -> ${dest}`,
    /** @param {string} segment */
    getText: async segment => {
      const fr = await getFileP(segment);
      return fr.readText();
    },
    /** @param {string} segment */
    storedPath: segment => getFileP(segment).then(f => f.toString()),
    /** @param {string} segment */
    size: async segment => {
      const fr = await getFileP(segment);
      const info = await fr.stat();
      return info.size;
    },
    remove,
  };
  return freeze(self);
};
freeze(makeWebCache);
