import { test } from 'tape-promise/tape';

import makeImporter from '../src';

test('end-to-end import', async t => {
  try {
    let transformModule;
    const indexSource = `\
// index.js
export { default as abc } from './abc';
`;
    const importer = makeImporter({
      resolve(specifier, referrer) {
        return new URL(specifier, referrer).href;
      },
      async locate(scopedRef) {
        if (scopedRef === 'https://example.com/hello/') {
          return 'https://example.com/hello/index.js';
        }
        if (scopedRef === 'https://example.com/hello/abc') {
          return 'https://example.com/hello/abc.js';
        }
        throw TypeError(`Unrecognized scopedRef`);
      },
      async retrieve(moduleId) {
        if (moduleId === 'https://example.com/hello/index.js') {
          return indexSource;
        }
        if (moduleId === 'https://example.com/hello/abc.js') {
          return `\
// abc.js
export default 123;
`;
        }
        throw TypeError(`Unrecognized retrieve ${moduleId}`);
      },
      rewrite(moduleSource, moduleId) {
        const rs = transformModule.rewrite({
          endowments: {},
          sourceType: 'module',
          src: moduleSource,
          url: moduleId,
        });
        return rs;
      },
      rootLinker: {
        link(linkageRecord, _recursiveLink, _preEndowments) {
          // eslint-disable-next-line no-eval
          let functor = (1, eval)(linkageRecord.functorSource);
          const moduleNS = {};
          const functorArg = {
            constVar: {
              default(val) {
                moduleNS.default = val;
              },
            },
          };
          return {
            async initialize() {
              if (functor) {
                // console.log(`have functor`, String(functor));
                const f = functor;
                functor = null;
                f(functorArg);
              }
            },
            moduleNS,
          };
        },
        instanceCache: new Map(),
      },
    });

    transformModule = {
      rewrite(rs) {
        if (rs.sourceType === 'module') {
          const staticRecord = {
            functorSource: `({ constVar }) => constVar.default(${JSON.stringify(
              rs.src,
            )});`,
            imports: {},
            moduleId: rs.url,
          };
          return {
            staticRecord,
            endowments: { hImport: 'something' },
            sourceType: 'script',
          };
        }
        return {
          src: '987',
          sourceType: 'script',
        };
      },
    };

    t.deepEquals(
      await importer({ spec: './hello/', url: 'https://example.com/' }),
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
        locate(scopedRef) {
          if (moduleCache.has(scopedRef)) {
            return scopedRef;
          }
          throw TypeError(`Don't know how to locate ${scopedRef}`);
        },
        rootLinker: {
          link(mlr, _recursiveLink, _preEndowments) {
            // console.log(`linking`, mlr);
            if (!mlr.source) {
              throw TypeError(`Don't know how to link non-source mlr`);
            }
            return {
              initialize() {
                // eslint-disable-next-line no-eval
                this.moduleNS = (1, eval)(mlr.source);
              },
              moduleNS: {},
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
