import { test } from 'tape-promise/tape';
import { makeEvaluators, evaluateProgram as evaluate } from '@agoric/evaluate';

import * as babelCore from '@babel/core';

import makeModuleTransformer from '../src/index';

const makeImporter = () => async (srcSpec, endowments) => {
  const { spec, staticRecord } = srcSpec;
  let actualSource;
  const doImport = async () => {
    const ret = { staticRecord };
    const functorArg = {
      imports(imp) {
        ret.imports = imp;
      },
    };
    // console.log(staticRecord.functorSource);
    evaluate(actualSource, endowments)(functorArg);
    return ret;
  };

  if (spec === undefined && staticRecord !== undefined) {
    actualSource = staticRecord.functorSource;
    return doImport();
  }

  throw Error(`Not expecting import expression`);
};

test('import', async t => {
  try {
    const importer = makeImporter();
    const transforms = [makeModuleTransformer(babelCore, importer)];
    const { evaluateModule } = makeEvaluators({
      transforms,
    });

    const exportNested = `(export default 123)`;
    t.throws(
      () => evaluateModule(exportNested),
      SyntaxError,
      `non-toplevel export fails`,
    );

    const srcNS = `import * as ns from 'module';`;
    const importNS = await evaluateModule(srcNS);
    const fsrcNS = importNS.staticRecord.functorSource;
    t.equal(typeof fsrcNS, 'string', 'namespace functor source is string');
    t.doesNotThrow(() => {
      importNS.imports
        .get('module')
        .get('*')
        .forEach(updater => updater(123));
    }, 'import namespace works');
    t.deepEquals(
      importNS.staticRecord,
      {
        imports: { module: ['*'] },
        liveExportMap: {},
        fixedExportMap: {},
        functorSource: fsrcNS,
      },
      'namespace static record',
    );

    const srcNames = `import { foo, bar } from 'module';`;
    const importNames = await evaluateModule(srcNames);
    const fsrcNames = importNames.staticRecord.functorSource;
    t.equal(typeof fsrcNames, 'string', 'names functor source is string');
    t.doesNotThrow(() => {
      importNames.imports
        .get('module')
        .get('foo')
        .forEach(updater => updater(123));
    }, 'import foo works');
    t.doesNotThrow(() => {
      importNames.imports
        .get('module')
        .get('bar')
        .forEach(updater => updater(123));
    }, 'import bar works');
    t.deepEquals(
      importNames.staticRecord,
      {
        imports: { module: ['foo', 'bar'] },
        liveExportMap: {},
        fixedExportMap: {},
        functorSource: fsrcNames,
      },
      'names static record',
    );

    const srcDefault = `import myName from 'module';`;
    const importDefault = await evaluateModule(srcDefault);
    const fsrcDefault = importDefault.staticRecord.functorSource;
    t.equal(typeof fsrcDefault, 'string', 'default functor source is string');
    t.doesNotThrow(() => {
      importDefault.imports
        .get('module')
        .get('default')
        .forEach(updater => updater(123));
    }, 'import default works');
    t.deepEquals(
      importDefault.staticRecord,
      {
        imports: { module: ['default'] },
        liveExportMap: {},
        fixedExportMap: {},
        functorSource: fsrcDefault,
      },
      'default static record',
    );

    const importDefaultAndNamed = await evaluateModule(`\
import myName, { otherName as other } from 'module';
`);
    t.doesNotThrow(() => {
      importDefaultAndNamed.imports
        .get('module')
        .get('default')
        .forEach(upd => upd({}));
      importDefaultAndNamed.imports
        .get('module')
        .get('otherName')
        .forEach(upd => upd('def'));
    }, 'import default and named works');

    const importNothing = await evaluateModule(`\
import 'module';
`);
    t.deepEquals(
      importNothing.imports,
      new Map([['module', new Map()]]),
      'import nothing works',
    );
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});
