import test from 'ava';
import '../index.js';
import { resolveNode, makeNodeImporter } from './node.js';

test('preserve file names in stack traces', async t => {
  if (Error().stack != null) {
    t.plan(1);
  } else {
    t.plan(0);
  }

  const makeImportHook = makeNodeImporter({
    'https://example.com/packages/erroneous/main.js': `
      throw Error("threw an error");
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
    t.truthy(
      /https:\/\/example.com\/packages\/erroneous/.exec(error.stack),
      'stack trace contains file name of emitting module',
    );
  }
});
