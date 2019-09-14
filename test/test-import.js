import { test } from 'tape-promise/tape';
import { makeEvaluators } from '@agoric/evaluate';

import * as babelCore from '@babel/core';

import makeModuleTransformer from '../src/index';

const makeMakeImporter = () => (
  srcSpec,
  createStaticRecord,
  evaluateProgram,
) => {
  const { spec, source } = srcSpec;
  let actualSource;
  const doImport = async () => {
    const staticRecord = createStaticRecord(actualSource);
    const ret = { staticRecord };
    const functorArg = {
      imports(imp) {
        ret.imports = imp;
      },
    };
    // console.log(staticRecord.functorSource);
    evaluateProgram(staticRecord.functorSource)(functorArg);
    return ret;
  };

  if (spec === undefined && source !== undefined) {
    actualSource = source;
    return doImport;
  }

  throw Error(`Not expecting import expression`);
};

test('import', async t => {
  try {
    const makeImporter = makeMakeImporter();
    const transforms = [makeModuleTransformer(babelCore, makeImporter)];
    const { evaluateModule } = makeEvaluators({
      transforms,
    });

    const srcNS = `import * as ns from 'module';`;
    const importNS = await evaluateModule(srcNS);
    const fsrcNS = importNS.staticRecord.functorSource;
    t.equal(typeof fsrcNS, 'string', 'namespace functor source is string');
    t.doesNotThrow(() => {
      importNS.imports.module['*'].forEach(updater => updater(123));
    }, 'import namespace works');
    t.deepEquals(
      importNS.staticRecord,
      {
        moduleSource: srcNS,
        imports: { module: ['*'] },
        liveExportMap: {},
        fixedExports: [],
        functorSource: fsrcNS,
      },
      'namespace static record',
    );

    const srcNames = `import { foo, bar } from 'module';`;
    const importNames = await evaluateModule(srcNames);
    const fsrcNames = importNames.staticRecord.functorSource;
    t.equal(typeof fsrcNames, 'string', 'names functor source is string');
    t.doesNotThrow(() => {
      importNames.imports.module.foo.forEach(updater => updater(123));
    }, 'import foo works');
    t.doesNotThrow(() => {
      importNames.imports.module.bar.forEach(updater => updater(123));
    }, 'import bar works');
    t.deepEquals(
      importNames.staticRecord,
      {
        moduleSource: srcNames,
        imports: { module: ['foo', 'bar'] },
        liveExportMap: {},
        fixedExports: [],
        functorSource: fsrcNames,
      },
      'names static record',
    );

    const srcDefault = `import myName from 'module';`;
    const importDefault = await evaluateModule(srcDefault);
    const fsrcDefault = importDefault.staticRecord.functorSource;
    t.equal(typeof fsrcDefault, 'string', 'default functor source is string');
    t.doesNotThrow(() => {
      importDefault.imports.module.default.forEach(updater => updater(123));
    }, 'import default works');
    t.deepEquals(
      importDefault.staticRecord,
      {
        moduleSource: srcDefault,
        imports: { module: ['default'] },
        liveExportMap: {},
        fixedExports: [],
        functorSource: fsrcDefault,
      },
      'default static record',
    );

    const importDefaultAndNamed = await evaluateModule(`\
import myName, { otherName as other } from 'module';
`);
    t.doesNotThrow(() => {
      importDefaultAndNamed.imports.module.default.forEach(upd => upd({}));
      importDefaultAndNamed.imports.module.otherName.forEach(upd => upd('def'));
    }, 'import default and named works');

    const importNothing = await evaluateModule(`\
import 'module';
`);
    t.deepEquals(importNothing.imports, { module: {} }, 'import nothing works');
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});
