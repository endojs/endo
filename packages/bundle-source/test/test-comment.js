import test from '@endo/ses-ava/prepare-endo.js';

import url from 'url';
import { decodeBase64 } from '@endo/base64';
import { parseArchive } from '@endo/compartment-mapper/import-archive.js';
import bundleSource from '../src/index.js';

function evaluate(src, endowments) {
  const c = new Compartment(endowments, {}, {});
  return c.evaluate(src);
}

test('trailing comment', async t => {
  const { source: src1 } = await bundleSource(
    url.fileURLToPath(
      new URL('../demo/comments/trailing-comment.js', import.meta.url),
    ),
    'nestedEvaluate',
  );

  const nestedEvaluate = src => {
    // console.log('========== evaluating', src);
    return evaluate(src, { nestedEvaluate });
  };
  // console.log(src1);
  const srcMap1 = `(${src1})`;
  const ex1 = nestedEvaluate(srcMap1)();

  // console.log(err.stack);
  t.is(typeof ex1.buildRootObject, 'function', `buildRootObject is exported`);
});

test('comment block opener', async t => {
  t.plan(1);
  const { source: src1 } = await bundleSource(
    url.fileURLToPath(
      new URL('../demo/comments/block-opener.js', import.meta.url),
    ),
    'nestedEvaluate',
  );

  const success = () => t.pass('body runs correctly');

  const nestedEvaluate = src => {
    // console.log('========== evaluating', src);
    return evaluate(src, { nestedEvaluate, success });
  };
  // console.log(src1);
  const srcMap1 = `(${src1})`;
  nestedEvaluate(srcMap1)();
});

test('comment block closer', async t => {
  t.plan(1);
  const { source: src1 } = await bundleSource(
    url.fileURLToPath(
      new URL('../demo/comments/block-closer.js', import.meta.url),
    ),
    'nestedEvaluate',
  );

  const success = () => t.pass('body runs correctly');

  const nestedEvaluate = src => {
    // console.log('========== evaluating', src);
    return evaluate(src, { nestedEvaluate, success });
  };
  // console.log(src1);
  const srcMap1 = `(${src1})`;
  nestedEvaluate(srcMap1)();
});

test('comments not associated with a code AST node', async t => {
  t.plan(1);
  const { endoZipBase64 } = await bundleSource(
    url.fileURLToPath(new URL('../demo/comments/types.js', import.meta.url)),
    'endoZipBase64',
  );
  const endoZipBytes = decodeBase64(endoZipBase64);
  const application = await parseArchive(endoZipBytes);
  // If the TypeScript comment in this module does not get rewritten,
  // attempting to import the module will throw a SES censorship error since
  // import calls in comments are not distinguishable from containment escape
  // through dynamic import.
  // To verify, disable this line in src/index.js and observe that this test
  // fails:
  //   (innerComments || []).forEach(node => rewriteComment(node, unmapLoc));
  // eslint-disable-next-line dot-notation
  await application['import']('./demo/comments/types.js');
  t.is(1, 1);
});
