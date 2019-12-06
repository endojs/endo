import { test } from 'tape-promise/tape';

import makeImporter from '../src';

test('end-to-end import', async t => {
  try {
    const indexSource = `\
// index.js
export { default as abc } from './abc';
`;
    const importer = makeImporter({
      resolve(specifier, referrer) {
        return new URL(specifier, referrer).href;
      },
      async locate(absSpecifier) {
        if (absSpecifier === 'https://example.com/hello/') {
          return 'https://example.com/hello/index.js';
        }
        if (absSpecifier === 'https://example.com/hello/abc') {
          return 'https://example.com/hello/abc.js';
        }
        throw TypeError(`Unrecognized absolute specifier ${absSpecifier}`);
      },
      async retrieve(moduleLocation) {
        if (moduleLocation === 'https://example.com/hello/index.js') {
          return { string: indexSource, type: 'module' };
        }
        if (moduleLocation === 'https://example.com/hello/abc.js') {
          return {
            string: `\
// abc.js
export default 123;
`,
            type: 'module',
          };
        }
        throw TypeError(`Unrecognized retrieve ${moduleLocation}`);
      },
      async analyze({ string }) {
        return {
          functorSource: `({ onceVar }) => onceVar.default(${JSON.stringify(
            string,
          )});`,
          imports: {},
        };
      },
      rootLinker: {
        link(linkageRecord, _recursiveLink, _preEndowments) {
          // eslint-disable-next-line no-eval
          let functor = (1, eval)(linkageRecord.functorSource);
          const moduleNS = {};
          const functorArg = {
            onceVar: {
              default(val) {
                moduleNS.default = val;
              },
            },
          };
          return {
            getNamespace() {
              if (functor) {
                // console.log(`have functor`, String(functor));
                const f = functor;
                functor = null;
                f(functorArg);
              }
              return moduleNS;
            },
          };
        },
        instanceCache: new Map(),
      },
    });

    t.deepEquals(
      await importer({
        specifier: './hello/',
        referrer: 'https://example.com/',
      }),
      { default: indexSource },
      'importer works',
    );
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});

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
        locate(absSpecifier) {
          if (moduleCache.has(absSpecifier)) {
            return absSpecifier;
          }
          throw TypeError(`Don't know how to locate ${absSpecifier}`);
        },
        rootLinker: {
          link(mlr, _recursiveLink, _preEndowments) {
            // console.log(`linking`, mlr);
            if (!mlr.source) {
              throw TypeError(`Don't know how to link non-source mlr`);
            }
            return {
              async getNamespace() {
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

    const imp = specifier =>
      importer({ specifier, referrer: 'file:///some/where/over' });
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
