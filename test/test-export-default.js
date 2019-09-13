import { test } from 'tape-promise/tape';
import { makeEvaluators } from '@agoric/evaluate';

import * as babelCore from '@babel/core';

import makeModuleTransformer from '../src/index';
import * as h from '../src/hidden';

test('export default', async t => {
  try {
    const makeImporter = (srcSpec, createStaticRecord, evaluateProgram) => {
      const { spec, source } = srcSpec;
      let actualSource;
      const doImport = async () => {
        const staticRecord = createStaticRecord(actualSource);
        const exportNS = {};
        const functorArg = {
          [h.HIDDEN_ONCE]: {
            default(val) {
              exportNS.default = val;
            },
          },
          [h.HIDDEN_IMPORTS](_imports) {},
        };
        // console.log(staticRecord.functorSource);
        evaluateProgram(staticRecord.functorSource)(functorArg);
        return exportNS;
      };

      if (spec === undefined && source !== undefined) {
        actualSource = source;
        return doImport;
      }

      actualSource = `export default ${JSON.stringify(spec)};`;
      return doImport();
    };

    const transforms = [makeModuleTransformer(babelCore, makeImporter)];
    const { evaluateExpr, evaluateProgram, evaluateModule } = makeEvaluators({
      transforms,
    });
    for (const [name, myEval] of Object.entries({
      evaluateExpr,
      evaluateProgram,
    })) {
      t.deepEqual(
        // eslint-disable-next-line no-await-in-loop
        await myEval(`import('foo')`, {}),
        { default: 'foo' },
        `${name} import expression works`,
      );
    }
    t.deepEqual(
      await evaluateModule(`export default bb;`, { bb: 'bingbang' }),
      { default: 'bingbang' },
      `endowed modules`,
    );

    const ns = await evaluateModule(`\
export default arguments;`);
    t.equal(typeof ns.default, 'object', 'arguments is an object');
    t.equal(ns.default.length, 1, 'arguments has only one entry');
    t.equal(typeof ns.default[0], 'string', 'arguments[0] is just string');

    const ns2 = await evaluateModule(`\
export default this;`);
    t.equal(ns2.default, undefined, 'this is undefined');
  } catch (e) {
    console.log('unexpected exception', e);
    t.assert(false, e);
  } finally {
    t.end();
  }
});
