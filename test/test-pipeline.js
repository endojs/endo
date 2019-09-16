import { test } from 'tape-promise/tape';

import makeImporter from '../src';

test('import cached specifier', async t => {
  try {
    const moduleCache = new Map([
      [
        '@agoric/hello',
        {
          source: `${nick => `Hello, ${nick}!`}`,
        },
      ],
    ]);
    const importer = makeImporter(
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
            console.log(`linking`, mlr);
            if (!mlr.source) {
              throw TypeError(`Don't know how to link non-source mlr`);
            }
            return {
              initialize() {
                // eslint-disable-next-line no-eval
                return (1, eval)(mlr.source);
              },
            };
          },
          instanceCache: new Map(),
        },
      },
      moduleCache,
    );

    const imp = spec => importer({ spec, url: 'file:///some/where/over' });
    t.deepEquals(
      (await imp('@agoric/hello'))('you'),
      'Hello, you!',
      `cached module passes pipeline`,
    );
    await t.rejects(
      imp('@agoric/goodbye'),
      TypeError,
      'no cached specifier fails pipeline',
    );
    await t.rejects(
      imp('./foo.js'),
      TypeError,
      'relative specifier fails pipeline',
    );
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});
