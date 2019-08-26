import { test } from 'tape-promise/tape';

import makeImportPipeline from '../src';

test.only('import pipeline', async t => {
  try {
    const SPECIFIER_MAGIC = {
      toString() {
        return 'SPECIFIER_MAGIC';
      },
    };
    const moduleCache = new Map([[SPECIFIER_MAGIC, 'hello123']]);
    const makeImporter = makeImportPipeline(
      {
        resolve(specifier, _referrer) {
          if (specifier === SPECIFIER_MAGIC) {
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
      await importer(SPECIFIER_MAGIC),
      'hello123',
      `pipeline works with magic specifier`,
    );
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});
