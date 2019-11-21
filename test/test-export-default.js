import { test } from 'tape-promise/tape';
import { makeEvaluators, evaluateProgram as evaluate } from '@agoric/evaluate';

import * as babelCore from '@babel/core';

import makeModuleTransformer from '../src/index';

const makeImporter = () => (srcSpec, endowments) => {
  const { spec, staticRecord } = srcSpec;
  let actualSource;
  const doImport = async () => {
    const exportNS = {};
    const functorArg = {
      onceVar: {
        default(val) {
          exportNS.default = val;
        },
      },
      imports(_imports) {},
    };
    // console.log(actualSource);
    evaluate(actualSource, endowments)(functorArg);
    return exportNS;
  };

  if (spec === undefined && staticRecord !== undefined) {
    actualSource = staticRecord.functorSource;
    return doImport();
  }

  actualSource = `({ onceVar }) => onceVar.default(${JSON.stringify(spec)});`;
  return doImport();
};

test('export default', async t => {
  try {
    const transforms = [makeModuleTransformer(babelCore, makeImporter())];
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

    const { default: Cls } = await evaluateModule(`\
export default class { valueOf() { return 45; } }
`);
    t.equal(Cls.name, 'default', `default class export is stamped`);
    t.equal(new Cls().valueOf(), 45, `valueOf returns properly`);

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
