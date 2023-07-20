import { jsOpts, jsonOpts, makeNodeBundleCache } from '../cache.js';

const USAGE =
  'bundle-source [--cache-js | --cache-json] cache/ module1.js bundleName1 module2.js bundleName2 ...';

/**
 * @param {[string, string, string[]]} args
 * @param {object} powers
 * @param {(spec: string) => any} powers.loadModule
 * @returns {void}
 */
export const main = async (args, { loadModule }) => {
  const [to, dest, ...pairs] = args;
  if (!(dest && pairs.length > 0 && pairs.length % 2 === 0)) {
    throw Error(USAGE);
  }

  let cacheOpts;
  // `--to` option is deprecated, but we now use it to mean `--cache-js`.
  if (to === '--to') {
    cacheOpts = jsOpts;
  } else if (to === '--cache-js') {
    cacheOpts = jsOpts;
  } else if (to === '--cache-json') {
    cacheOpts = jsonOpts;
  } else {
    throw Error(USAGE);
  }

  const cache = await makeNodeBundleCache(
    dest,
    { cacheOpts, cacheSourceMaps: true },
    loadModule,
  );

  for (let ix = 0; ix < pairs.length; ix += 2) {
    const [bundleRoot, bundleName] = pairs.slice(ix, ix + 2);

    // eslint-disable-next-line no-await-in-loop
    await cache.validateOrAdd(bundleRoot, bundleName);
  }
};
