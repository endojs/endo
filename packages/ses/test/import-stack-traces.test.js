import tap from 'tap';
import { Compartment } from '../src/main.js';
import { resolveNode, makeNodeImporter } from './node.js';

const { test } = tap;

test('preserve file names in stack traces', async t => {
  const makeImportHook = makeNodeImporter({
    'https://example.com/packages/erroneous/main.js': `
      throw new Error("threw an error");
    `,
  });

  const compartment = new Compartment(
    {}, // endowments
    {}, // module map
    {
      resolveHook: resolveNode,
      importHook: makeImportHook('https://example.com/packages/erroneous'),
    },
  );

  let error;
  try {
    await compartment.import('./main.js');
  } catch (_error) {
    error = _error;
  }

  // Not all environments that run this test will necessarily surface stack
  // traces, but all that do should respect the //# sourceURL directive that
  // transform-module injects.
  if (error.stack != null) {
    t.ok(
      /https:\/\/example.com\/packages\/erroneous/.exec(error.stack),
      'stack trace contains file name of emitting module',
    );
  }

  t.end();
});
