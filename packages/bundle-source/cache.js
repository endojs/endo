// @ts-check
import { makePromiseKit } from '@endo/promise-kit';
import { makeReadPowers } from '@endo/compartment-mapper/node-powers.js';

import bundleSource from './src/index.js';

const { Fail, quote: q } = assert;

/**
 * @typedef {(...args: unknown[]) => void} Logger A message logger.
 */

/**
 * @typedef {object} BundleMeta
 * @property {string} bundleFileName
 * @property {string} bundleTime ISO format
 * @property {{ relative: string, absolute: string }} moduleSource
 * @property {Array<{ relativePath: string, mtime: string }>} contents
 */

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

export const jsOpts = {
  encodeBundle: bundle => `export default ${JSON.stringify(bundle)};\n`,
  toBundleName: n => `bundle-${n}.js`,
  toBundleMeta: n => `bundle-${n}-js-meta.json`,
};

export const jsonOpts = {
  encodeBundle: bundle => `${JSON.stringify(bundle)}\n`,
  toBundleName: n => `bundle-${n}.json`,
  toBundleMeta: n => `bundle-${n}-json-meta.json`,
};

export const makeBundleCache = (wr, cwd, readPowers, opts) => {
  const {
    cacheOpts: { encodeBundle, toBundleName, toBundleMeta } = jsOpts,
    log: defaultLog = console.warn,
    ...bundleOptions
  } = opts || {};

  const add = async (rootPath, targetName, log = defaultLog) => {
    const srcRd = cwd.neighbor(rootPath);

    const statsByPath = new Map();

    const loggedRead = async loc => {
      if (!loc.match(/\bpackage.json$/)) {
        try {
          const itemRd = cwd.neighbor(new URL(loc).pathname);
          const ref = srcRd.relative(itemRd.absolute());
          /** @type {import('fs').Stats} */
          const stats = await itemRd.stat();
          statsByPath.set(ref, stats);
          // console.log({ loc, mtime, ref });
        } catch (oops) {
          log(oops);
        }
      }
      return readPowers.read(loc);
    };

    await wr.mkdir({ recursive: true });

    const bundleFileName = toBundleName(targetName);
    const bundleWr = wr.neighbor(bundleFileName);
    const metaWr = wr.neighbor(toBundleMeta(targetName));

    // Prevent other processes from doing too much work just to see that we're
    // already on it.
    await metaWr.rm({ force: true });
    await bundleWr.rm({ force: true });

    const bundle = await bundleSource(rootPath, bundleOptions, {
      ...readPowers,
      read: loggedRead,
    });

    const { moduleFormat } = bundle;
    assert.equal(moduleFormat, 'endoZipBase64');

    const code = encodeBundle(bundle);
    await wr.mkdir({ recursive: true });
    const { mtime: bundleTime, size: bundleSize } =
      await bundleWr.atomicWriteText(code);

    /** @type {BundleMeta} */
    const meta = {
      bundleFileName,
      bundleTime: bundleTime.toISOString(),
      bundleSize,
      moduleSource: {
        relative: bundleWr.readOnly().relative(srcRd.absolute()),
        absolute: srcRd.absolute(),
      },
      contents: [...statsByPath.entries()].map(
        ([relativePath, { mtime, size }]) => ({
          relativePath,
          mtime: mtime.toISOString(),
          size,
        }),
      ),
    };

    await metaWr.atomicWriteText(JSON.stringify(meta, null, 2));
    return meta;
  };

  const validate = async (meta, targetName, rootOpt, log = defaultLog) => {
    const {
      bundleFileName,
      bundleTime,
      bundleSize,
      contents,
      moduleSource: { absolute: moduleSource },
    } = meta;
    assert.equal(bundleFileName, toBundleName(targetName));
    if (rootOpt) {
      moduleSource === cwd.neighbor(rootOpt).absolute() ||
        Fail`bundle ${targetName} was for ${moduleSource}, not ${rootOpt}`;
    }
    /** @type {import('fs').Stats} */
    const { mtime: actualBundleTime, size: actualBundleSize } = await wr
      .readOnly()
      .neighbor(bundleFileName)
      .stat();
    assert.equal(actualBundleTime.toISOString(), bundleTime);
    assert.equal(actualBundleSize, bundleSize);
    const moduleRd = wr.readOnly().neighbor(moduleSource);
    const actualStats = await Promise.all(
      contents.map(
        async ({ relativePath, mtime: priorMtime, size: priorSize }) => {
          const itemRd = moduleRd.neighbor(relativePath);
          /** @type {import('fs').Stats} */
          const { mtime, size } = await itemRd.stat();
          return {
            relativePath,
            mtime: mtime.toISOString(),
            size,
            priorMtime,
            priorSize,
          };
        },
      ),
    );
    const changed = actualStats.filter(
      ({ mtime, size, priorMtime, priorSize }) =>
        mtime !== priorMtime || size !== priorSize,
    );
    changed.length === 0 ||
      Fail`changed: ${q(changed)}. ${q(targetName)} bundled at ${q(
        bundleTime,
      )}`;
    return meta;
  };

  /**
   * @param {string} rootPath
   * @param {string} targetName
   * @param {Logger} [log]
   * @returns {Promise<BundleMeta>}
   */
  const validateOrAdd = async (rootPath, targetName, log = defaultLog) => {
    const metaText = await wr
      .readOnly()
      .neighbor(toBundleMeta(targetName))
      .maybeReadText()
      .catch(
        ioError =>
          Fail`${targetName}: cannot read bundle metadata: ${q(ioError)}`,
      );

    /** @type {BundleMeta | undefined} */
    let meta = metaText ? JSON.parse(metaText) : undefined;

    if (meta !== undefined) {
      try {
        meta = await validate(meta, targetName, rootPath, log);
        const { bundleTime, bundleSize, contents } = meta;
        log(
          `${wr}`,
          toBundleName(targetName),
          'valid:',
          contents.length,
          'files bundled at',
          bundleTime,
          'with size',
          bundleSize,
        );
      } catch (invalid) {
        meta = undefined;
        log(invalid);
      }
    }

    if (meta === undefined) {
      log(`${wr}`, 'add:', targetName, 'from', rootPath);
      meta = await add(rootPath, targetName, log);
      const { bundleFileName, bundleTime, contents } = meta;
      log(
        `${wr}`,
        'bundled',
        contents.length,
        'files in',
        bundleFileName,
        'at',
        bundleTime,
      );
    }

    return meta;
  };

  const loaded = new Map();
  /**
   * @param {string} rootPath
   * @param {string} [targetName]
   * @param {Logger} [log]
   */
  const load = async (
    rootPath,
    targetName = readPowers.basename(rootPath, '.js'),
    log = defaultLog,
  ) => {
    const found = loaded.get(targetName);
    // console.log('load', { targetName, found: !!found, rootPath });
    if (found && found.rootPath === rootPath) {
      return found.bundle;
    }
    const todo = makePromiseKit();
    loaded.set(targetName, { rootPath, bundle: todo.promise });
    const bundle = await validateOrAdd(rootPath, targetName, log)
      .then(({ bundleFileName }) =>
        import(`${wr.readOnly().neighbor(bundleFileName)}`),
      )
      .then(m => harden(m.default));
    assert.equal(bundle.moduleFormat, 'endoZipBase64');
    todo.resolve(bundle);
    return bundle;
  };

  return harden({
    add,
    validate,
    validateOrAdd,
    load,
  });
};

/**
 * @param {string} dest
 * @param {{ format?: string, dev?: boolean }} options
 * @param {(id: string) => Promise<any>} loadModule
 * @param {number} pid
 */
export const makeNodeBundleCache = async (dest, options, loadModule, pid) => {
  const [fs, path, url, crypto, timers] = await Promise.all([
    await loadModule('fs'),
    await loadModule('path'),
    await loadModule('url'),
    await loadModule('crypto'),
    await loadModule('timers'),
  ]);

  const readPowers = {
    ...makeReadPowers({ fs, url, crypto }),
    delay: ms => new Promise(resolve => timers.setTimeout(resolve, ms)),
    basename: path.basename,
  };

  const cwd = makeFileReader('', { fs, path });
  await fs.promises.mkdir(dest, { recursive: true });
  const destWr = makeFileWriter(dest, { fs, path }, pid);
  return makeBundleCache(destWr, cwd, readPowers, options);
};
