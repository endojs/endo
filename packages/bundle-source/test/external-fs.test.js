import 'ses';
import url from 'url';
import test from '@endo/ses-ava/prepare-endo.js';

import bundleSource from '../src/index.js';

function evaluate(src, endowments) {
  const c = new Compartment(endowments, {}, {});
  return c.evaluate(src);
}

test(`external require('fs')`, async t => {
  t.plan(1);
  const { source: src1 } = await bundleSource(
    url.fileURLToPath(new URL(`../demo/external-fs.js`, import.meta.url)),
    'nestedEvaluate',
  );

  const myRequire = mod => {
    t.is(mod, 'fs', 'required fs module');
    return { readFileSync() {} };
  };

  const nestedEvaluate = src => {
    // console.log('========== evaluating', src);
    return evaluate(src, { nestedEvaluate, require: myRequire, assert });
  };
  // console.log(src1);
  const srcMap1 = `(${src1})`;
  nestedEvaluate(srcMap1)();
});

const testFsImportHookEndoZipBase64 = (name, file) => {
  test(`bundle ${name} with endoZipBase64`, async t => {
    // We expect the provided importHook is called with 'fs' exactly once
    t.plan(1);

    const testFile = url.fileURLToPath(new URL(file, import.meta.url));

    // @ts-expect-error BundleOptions needs updating
    await bundleSource(testFile, {
      format: 'endoZipBase64',
      importHook: async specifier => {
        if (specifier === 'fs') {
          t.is(specifier, 'fs', 'imported fs module');
          return true;
        }
        return undefined;
      },
    });
  });
};

testFsImportHookEndoZipBase64('import fs', '../demo/external-fs.js');
testFsImportHookEndoZipBase64(
  'transitive import fs',
  '../demo/external-fs-transitive.js',
);
