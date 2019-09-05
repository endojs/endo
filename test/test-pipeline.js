import { test } from 'tape-promise/tape';

import makeImportPipeline from '../src';

test('import cached specifier', async t => {
  try {
    const moduleCache = new Map([['@agoric/hello', 'hello123']]);
    const makeImporter = makeImportPipeline(
      {
        resolve(specifier, _referrer) {
          if (moduleCache.has(specifier)) {
            return specifier;
          }
          throw TypeError(`Don't know how to resolve ${specifier}`);
        },
        locate(scopedRef) {
          if (moduleCache.has(scopedRef)) {
            return scopedRef;
          }
          throw TypeError(`Don't know how to locate ${scopedRef}`);
        },
        rootContainer: {
          link(mlr, _mimp) {
            return {
              initialize() {
                return mlr;
              },
            };
          },
          instanceCache: new Map(),
        },
      },
      moduleCache,
    );

    const importer = makeImporter('file:///some/where/over');
    t.deepEquals(
      await importer('@agoric/hello'),
      'hello123',
      `pipeline bypasses location and retrieval with cached specifier`,
    );
    await t.rejects(
      importer('@agoric/goodbye'),
      TypeError,
      'no cached specifier fails pipeline',
    );
    await t.rejects(
      importer('./foo.js'),
      TypeError,
      'relative specifier fails pipeline',
    );
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});
