// @ts-check
/* global process */
import { parseArgs } from 'util';

import bundleSource, { SUPPORTED_FORMATS } from './bundle-source.js';
import { jsOpts, jsonOpts, makeNodeBundleCache } from '../cache.js';

/** @import {ModuleFormat} from './types.js' */

const USAGE = `\
bundle-source [-Tft] <entry.js>
bundle-source [-Tft] --cache-js|--cache-json <cache/> (<entry.js> <bundle-name>)*
  -f,--format endoZipBase64*|nestedEvaluate|getExport
  -C,--condition <condition> (browser, node, development, &c)
  -C development (to access devDependencies)
  -T,--no-transforms`;

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
  format: {
    type: 'string',
    short: 'f',
    multiple: false,
  },
  condition: {
    type: 'string',
    short: 'C',
    multiple: true,
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
  await null;
  const {
    values: {
      format: moduleFormat = 'endoZipBase64',
      condition: conditions = [],
      'no-transforms': noTransforms,
      'cache-json': cacheJson,
      'cache-js': cacheJs,
      // deprecated
      to: cacheJsAlias,
    },
    positionals,
  } = parseArgs({ args, options, allowPositionals: true });

  if (!SUPPORTED_FORMATS.includes(moduleFormat)) {
    throw Error(`Unsupported format: ${moduleFormat}\n\n${USAGE}`);
  }
  const format = /** @type {ModuleFormat} */ (moduleFormat);

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
    if (positionals.length !== 1) {
      throw new Error(USAGE);
    }
    const [entryPath] = positionals;
    const bundle = await bundleSource(entryPath, {
      noTransforms,
      format,
      conditions,
    });
    process.stdout.write(JSON.stringify(bundle));
    process.stdout.write('\n');
    return;
  }

  if (
    !(
      positionals.length > 0 &&
      positionals.length % 2 === 0 &&
      [cacheJson, cacheJs, cacheJsAlias].filter(Boolean).length === 1
    )
  ) {
    throw Error(USAGE);
  }

  const cache = await makeNodeBundleCache(
    dest,
    { cacheOpts, cacheSourceMaps: true, log },
    loadModule,
    pid,
  );

  for (let ix = 0; ix < positionals.length; ix += 2) {
    const [bundleRoot, bundleName] = positionals.slice(ix, ix + 2);

    // eslint-disable-next-line no-await-in-loop
    await cache.validateOrAdd(bundleRoot, bundleName, undefined, {
      noTransforms,
      format,
      conditions,
    });
  }
};
