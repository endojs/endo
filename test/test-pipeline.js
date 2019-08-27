import { test } from 'tape-promise/tape';

import makeImportPipeline from '../src';

test.only('import magic specifier', async t => {
  try {
    const MAGIC_SPECIFIER = {
      toString() {
        return 'MAGIC_SPECIFIER';
      },
    };
    const moduleCache = new Map([[MAGIC_SPECIFIER, 'hello123']]);
    const makeImporter = makeImportPipeline(
      {
        resolve(specifier, _referrer) {
          if (specifier === MAGIC_SPECIFIER) {
            return specifier;
          }
          throw TypeError(`Not a magical referrer`);
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
      await importer(MAGIC_SPECIFIER),
      'hello123',
      `pipeline bypasses location and retrieval with magic specifier`,
    );
    await t.rejects(
      importer('./foo.js'),
      TypeError,
      'no magic specifier fails pipeline',
    );
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});
