import { createHash } from 'crypto';
import getBundleSource from '@endo/bundle-source';
import { makeExo } from '@endo/exo';
import { E } from '@endo/far';
import { M } from '@endo/patterns';
import { makeReaderRef } from '@endo/daemon';

/** 
 * A small caplet with file system access that can use @endo/bundle-source.
 */
export const make = () => {
  /** @type {Map<string, [string, string]>} */
  const bundleCache = new Map();
  const textEncoder = new TextEncoder();

  /** @param {string} bundleSourceString */
  const makeBundleHash = (bundleSourceString) => {
    const hash = createHash('sha1').update(bundleSourceString).digest('hex');
    return 'b-' + hash.slice(2);
  }

  return makeExo(
    'Bundler',
    M.interface('Bundler', {}, { defaultGuards: 'passable' }),
    {
      /** @param {string} path */
      prepareBundle(path) {
        if (!bundleCache.has(path)) {
          const bundleSource = getBundleSource(path);
          const bundleText = JSON.stringify(bundleSource);
          const bundleHash = makeBundleHash(bundleText);
          const bundleBytes = textEncoder.encode(bundleText);
          const bundleReaderRef = makeReaderRef([bundleBytes]);
          
          bundleCache.set(path, [bundleReaderRef, bundleHash]);
        }

        return bundleCache.get(path);
      }
    },
  );
}
