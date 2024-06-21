// @ts-check
import { parseArgs } from 'util';
import { jsOpts, jsonOpts, makeNodeBundleCache } from '../cache.js';

const USAGE =
  'bundle-source [-T,--no-transforms] [--cache-js | --cache-json] cache/ module1.js bundleName1 module2.js bundleName2 ...';

const options = /** @type {const} */ ({
  'no-transforms': {
    type: 'boolean',
    short: 'T',
    multiple: false,
  },
  'cache-js': {
    type: 'string',
    multiple: false,
  },
  'cache-json': {
    type: 'string',
    multiple: false,
  },
  // deprecated
  to: {
    type: 'string',
    multiple: false,
  },
});

/**
 * @param {[to: string, dest: string, ...rest: string[]]} args
 * @param {object} powers
 * @param {(spec: string) => any} powers.loadModule
 * @param {number} powers.pid
 * @param {import('../cache.js').Logger} [powers.log]
 * @returns {Promise<void>}
 */
export const main = async (args, { loadModule, pid, log }) => {
  const {
    values: {
      'no-transforms': noTransforms,
      'cache-json': cacheJson,
      'cache-js': cacheJs,
      // deprecated
      to: cacheJsAlias,
    },
    positionals: pairs,
  } = parseArgs({ args, options, allowPositionals: true });

  if (
    !(
      pairs.length > 0 &&
      pairs.length % 2 === 0 &&
      [cacheJson, cacheJs, cacheJsAlias].filter(Boolean).length === 1
    )
  ) {
    throw Error(USAGE);
  }

  /** @type {string} */
  let dest;
  let cacheOpts;
  // `--to` option is deprecated, but we now use it to mean `--cache-js`.
  if (cacheJs !== undefined) {
    dest = cacheJs;
    cacheOpts = jsOpts;
  } else if (cacheJsAlias !== undefined) {
    dest = cacheJsAlias;
    cacheOpts = jsOpts;
  } else if (cacheJson !== undefined) {
    dest = cacheJson;
    cacheOpts = jsonOpts;
  } else {
    // unreachable
    throw Error(USAGE);
  }

  const cache = await makeNodeBundleCache(
    dest,
    { cacheOpts, cacheSourceMaps: true, log },
    loadModule,
    pid,
  );

  for (let ix = 0; ix < pairs.length; ix += 2) {
    const [bundleRoot, bundleName] = pairs.slice(ix, ix + 2);

    // eslint-disable-next-line no-await-in-loop
    await cache.validateOrAdd(bundleRoot, bundleName, undefined, {
      noTransforms,
    });
  }
};
