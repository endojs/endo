// @ts-check
import { makePromiseKit } from '@endo/promise-kit';
import { makeReadPowers } from '@endo/compartment-mapper/node-powers.js';

import bundleSource, { DEFAULT_MODULE_FORMAT } from './src/bundle-source.js';
import { makeFileReader, makeAtomicFileWriter } from './src/fs.js';

const { Fail, quote: q } = assert;

/** @import {BundleCache, BundleCacheOperationOptions, BundleCacheOptions, BundleMeta, CacheOpts, Logger, ModuleFormat} from './src/types.js' */

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

/**
 * Create a disk-backed cache for generated source bundles and their metadata.
 *
 * @param {ReturnType<typeof makeAtomicFileWriter>} wr Writer rooted at the cache destination directory.
 * @param {ReturnType<typeof makeFileReader>} cwd Reader rooted at the process working directory.
 * @param {ReturnType<typeof makeReadPowers> & { basename: (path: string, suffix?: string) => string }} readPowers Reader and path helpers used by bundling.
 * @param {BundleCacheOptions} [opts] Cache behavior, logging, and default bundling options.
 * @returns {BundleCache}
 */
export const makeBundleCache = (wr, cwd, readPowers, opts) => {
  const {
    cacheOpts: { encodeBundle, toBundleName, toBundleMeta } = jsOpts,
    log: defaultLog = console.warn,
    ...bundleOptions
  } = opts || {};

  /**
   * @param {string} targetName
   * @param {string} metaText
   * @returns {BundleMeta}
   */
  const parseMetaText = (targetName, metaText) => {
    try {
      return JSON.parse(metaText);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw SyntaxError(`Cannot parse JSON from ${targetName}, ${error}`);
      }
      throw error;
    }
  };

  /**
   * Bundle `rootPath` and unconditionally write fresh bundle + metadata files.
   *
   * Use this when you want to force a rebuild and overwrite any existing cache
   * entry for `targetName`, regardless of whether a prior bundle is still valid.
   *
   * @param {string} rootPath
   * @param {string} targetName
   * @param {Logger} [log]
   * @param {BundleCacheOperationOptions} [options]
   * @returns {Promise<BundleMeta>}
   */
  const add = async (rootPath, targetName, log = defaultLog, options = {}) => {
    const srcRd = cwd.neighbor(rootPath);

    const {
      noTransforms = false,
      elideComments = false,
      format = 'endoZipBase64',
      conditions = [],
    } = options;

    const sortedConditions = [...conditions].sort();

    const statsByPath = new Map();

    const loggedRead = async loc => {
      await null;
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

    const bundle = await bundleSource(
      rootPath,
      {
        ...bundleOptions,
        noTransforms,
        elideComments,
        format,
        conditions: sortedConditions,
      },
      {
        ...readPowers,
        read: loggedRead,
      },
    );

    const code = encodeBundle(bundle);
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
      noTransforms,
      elideComments,
      format,
      conditions: sortedConditions,
    };

    await metaWr.atomicWriteText(JSON.stringify(meta, null, 2));
    return meta;
  };

  /**
   * Read cached metadata JSON as raw text.
   *
   * @param {string} targetName
   * @param {Logger} _log
   * @returns {Promise<string | undefined>}
   */
  const loadMetaText = (targetName, _log = defaultLog) =>
    wr
      .readOnly()
      .neighbor(toBundleMeta(targetName))
      .maybeReadText()
      .catch(
        ioError =>
          Fail`${targetName}: cannot read bundle metadata: ${q(ioError)}`,
      );

  /**
   * Validate an existing cache entry against bundle options and source file
   * stats (mtime/size), throwing if any mismatch is detected.
   *
   * Use this when metadata should already exist and you need a strict
   * up-to-date check before trusting a cached bundle.
   *
   * @param {string} targetName
   * @param {unknown} rootOpt Optional root path to assert against recorded metadata.
   * @param {Logger} [log]
   * @param {BundleMeta} [meta]
   * @param {BundleCacheOperationOptions} [options]
   * @returns {Promise<BundleMeta>}
   */
  const validate = async (
    targetName,
    rootOpt,
    log = defaultLog,
    meta = undefined,
    options = {},
  ) => {
    await null;
    const {
      noTransforms: expectedNoTransforms = false,
      elideComments: expectedElideComments = false,
      format: expectedFormat = DEFAULT_MODULE_FORMAT,
      conditions: expectedConditions = [],
    } = options;
    const sortedExpectedConditions = [...expectedConditions].sort();
    if (!meta) {
      const metaJson = await loadMetaText(targetName, log);
      if (metaJson) {
        meta = parseMetaText(targetName, metaJson);
      }
    }
    if (!meta) {
      throw Fail`no metadata found for ${q(targetName)}`;
    }
    const {
      bundleFileName,
      bundleTime,
      bundleSize,
      contents,
      moduleSource: { absolute: moduleSource },
      format = 'endoZipBase64',
      noTransforms = false,
      elideComments = false,
      conditions = [],
    } = meta;
    const sortedConditions = [...conditions].sort();
    assert.equal(bundleFileName, toBundleName(targetName));
    assert.equal(format, expectedFormat);
    assert.equal(noTransforms, expectedNoTransforms);
    assert.equal(elideComments, expectedElideComments);
    assert.equal(sortedConditions.length, sortedExpectedConditions.length);
    sortedConditions.forEach((tag, index) => {
      assert.equal(tag, sortedExpectedConditions[index]);
    });
    if (rootOpt !== undefined && rootOpt !== null) {
      if (typeof rootOpt !== 'string') {
        throw Fail`bundle ${targetName} expected a string root path, not ${q(rootOpt)}`;
      }
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
   * Attempt to reuse a valid cached bundle; otherwise rebuild and persist it.
   *
   * Use this as the default entry point for cache-backed bundling when you want
   * "validate-if-present, add-if-missing-or-stale" behavior in one call.
   *
   * @param {string} rootPath
   * @param {string} targetName
   * @param {Logger} [log]
   * @param {BundleCacheOperationOptions} [options]
   * @returns {Promise<BundleMeta>}
   */
  const validateOrAdd = async (
    rootPath,
    targetName,
    log = defaultLog,
    options = {},
  ) => {
    const metaText = await loadMetaText(targetName, log);

    /** @type {BundleMeta | undefined} */
    let meta = metaText ? parseMetaText(targetName, metaText) : undefined;

    if (meta !== undefined) {
      try {
        meta = await validate(targetName, rootPath, log, meta, {
          format: options.format,
          noTransforms: options.noTransforms,
          elideComments: options.elideComments,
          conditions: options.conditions,
        });
        const {
          bundleTime,
          bundleSize,
          contents,
          noTransforms,
          elideComments,
          format = 'endoZipBase64',
          conditions = [],
        } = meta;
        log(
          `${wr}`,
          toBundleName(targetName),
          'valid:',
          contents.length,
          'files bundled at',
          bundleTime,
          'with size',
          bundleSize,
          `${noTransforms ? 'w/o transforms' : 'with transforms'}${elideComments ? ' and comments elided' : ''}`,
          'with format',
          format,
          'and conditions',
          JSON.stringify(conditions),
        );
      } catch (invalid) {
        meta = undefined;
        log(invalid);
      }
    }

    if (meta === undefined) {
      log(`${wr}`, 'add:', targetName, 'from', rootPath);
      meta = await add(rootPath, targetName, log, options);
      const {
        bundleFileName,
        bundleTime,
        contents,
        noTransforms,
        elideComments,
        format = 'endoZipBase64',
        conditions = [],
      } = meta;
      log(
        `${wr}`,
        'bundled',
        contents.length,
        'files in',
        bundleFileName,
        'at',
        bundleTime,
        `${noTransforms ? 'w/o transforms' : 'with transforms'}${elideComments ? ' and comments elided' : ''}`,
        'with format',
        format,
        'and conditions',
        JSON.stringify(conditions),
      );
    }

    return meta;
  };

  const loaded = new Map();
  /**
   * Load a bundle by target name, validating existing cache entries or creating
   * them on demand. Results are memoized per `targetName`.
   *
   * @param {string} rootPath
   * @param {string} [targetName]
   * @param {Logger} [log]
   * @param {BundleCacheOperationOptions} [options]
   * @returns {Promise<unknown>}
   */
  const load = async (
    rootPath,
    targetName = readPowers.basename(rootPath, '.js'),
    log = defaultLog,
    options = {},
  ) => {
    const found = loaded.get(targetName);
    // console.log('load', { targetName, found: !!found, rootPath });
    if (found && found.rootPath === rootPath) {
      return found.bundle;
    }
    const todo = makePromiseKit();
    // This promise may be rejected before any concurrent caller awaits it.
    todo.promise.catch(() => {});
    loaded.set(targetName, { rootPath, bundle: todo.promise });
    const bundle = await validateOrAdd(rootPath, targetName, log, options)
      .then(
        ({ bundleFileName }) =>
          import(`${wr.readOnly().neighbor(bundleFileName)}`),
      )
      .then(m => harden(m.default))
      .catch(error => {
        todo.reject(error);
        const latest = loaded.get(targetName);
        if (
          latest &&
          latest.bundle === todo.promise &&
          latest.rootPath === rootPath
        ) {
          loaded.delete(targetName);
        }
        throw error;
      });
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
 * Build a bundle cache instance configured for Node.js powers and filesystem
 * implementations loaded from the provided module loader.
 *
 * @param {string} dest
 * @param {{ format?: string, cacheOpts?: CacheOpts, cacheSourceMaps?: boolean, dev?: boolean, log?: Logger } & BundleCacheOperationOptions} options
 * @param {(id: string) => Promise<any>} loadModule
 * @param {number} [pid]
 * @param {number} [nonce]
 * @returns {Promise<BundleCache>}
 */
export const makeNodeBundleCache = async (
  dest,
  options,
  loadModule,
  pid,
  nonce,
) => {
  const [fs, path, url, crypto, timers, os] = await Promise.all([
    loadModule('fs'),
    loadModule('path'),
    loadModule('url'),
    loadModule('crypto'),
    loadModule('timers'),
    loadModule('os'),
  ]);

  if (nonce === undefined) {
    nonce = crypto.randomInt(0xffff_ffff);
  }

  const readPowers = {
    ...makeReadPowers({ fs, url, crypto }),
    delay: ms => new Promise(resolve => timers.setTimeout(resolve, ms)),
    basename: path.basename,
  };

  const cwd = makeFileReader('', { fs, path });
  await fs.promises.mkdir(dest, { recursive: true });
  const destWr = makeAtomicFileWriter(dest, { fs, path, os }, pid, nonce);
  return makeBundleCache(destWr, cwd, readPowers, options);
};
