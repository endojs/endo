// Verifies that observable behavior of a module exports namespace object
// differs between Node.js native ESM and a SES Compartment when one module
// attempts `import * as foo from './a'; foo.x = 'bar'` and another module
// later imports `x` from the same module.
//
// The vulnerability hypothesis: the assignment in one module leaks across to
// override `x` as imported by a later module. Both runtimes prevent that
// override, but the *shape* of the protection differs in observable ways
// (descriptor form, frozen state, error name on assignment), and this test
// pins down those differences so future changes to either side are noticed.

import test from 'ava';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { ModuleSource } from '@endo/module-source';

import '../index.js';

const execFileP = promisify(execFile);

const fixtureDir = fileURLToPath(
  new URL('_namespace-mutation/', import.meta.url),
);

const runInNode = async () => {
  const { stdout } = await execFileP(process.execPath, ['./main.js'], {
    cwd: fixtureDir,
  });
  return JSON.parse(stdout);
};

const runInCompartment = async () => {
  // Load the same .js sources Node.js executes (the fixture's package.json
  // declares "type": "module"), so the Compartment's linker sees byte-
  // identical module bodies for a.js, b.js, and c.js.
  const fixtureUrl = new URL('_namespace-mutation/', import.meta.url);
  const readSource = name => readFile(new URL(name, fixtureUrl), 'utf8');
  const sources = {
    './a.cjs': await readSource('a.cjs'),
    './b.js': await readSource('b.js'),
    './c.js': await readSource('c.js'),
    // main.js writes to process.stdout in Node.js; in the Compartment we pull
    // values straight off the namespace, so substitute a re-exporting entry.
    './main.js': `
      export { result } from './b.js';
      export { seenByLaterImport } from './c.js';
    `,
  };

  const compartment = new Compartment({
    __options__: true,
    __noNamespaceBox__: true,
    // modules take precedence over importHook
    modules: {
      // minimal, hardcoded, cjs emulation
      './a.cjs': {
        source: {
          imports: [],
          exports: ['x'],
          execute(env) {
            // eslint-disable-next-line no-new-func
            new Function('module', 'exports', 'require', sources['./a.cjs'])(
              { exports: env },
              env,
              () => {},
            );
          },
        },
      },
    },
    resolveHook: spec => spec,
    importHook: async spec => {
      const src = sources[spec];
      if (src === undefined) throw Error(`not found: ${spec}`);
      return new ModuleSource(src);
    },
  });

  // Round-trip through JSON to drop functions (e.g. accessor descriptors) and
  // make a fair structural comparison with the Node.js subprocess output,
  // which can only emit JSON.
  const ns = await compartment.import('./main.js');
  return JSON.parse(
    JSON.stringify({
      result: ns.result,
      seenByLaterImport: ns.seenByLaterImport,
    }),
  );
};

test('cross-module namespace mutation: Node.js vs SES Compartment', async t => {
  const [nodeOut, sesOut] = await Promise.all([
    runInNode(),
    runInCompartment(),
  ]);

  // Both runtimes agree: x is 'foo' before any attempted mutation.
  t.is(nodeOut.result.before, 'foo');
  t.is(sesOut.result.before, 'foo');

  // Both runtimes agree: assignment via `foo.x = 'bar'` throws TypeError
  // (module bodies are strict, and the namespace's [[Set]] returns false).
  t.true(nodeOut.result.assignThrew);
  t.true(sesOut.result.assignThrew);
  t.is(nodeOut.result.assignErrorName, 'TypeError');
  t.is(sesOut.result.assignErrorName, 'TypeError');

  // Both runtimes agree: Reflect.set returns false (no throw, but no-op).
  t.false(nodeOut.result.reflectSetReturn);
  t.false(sesOut.result.reflectSetReturn);
  t.is(nodeOut.result.afterReflectSet, 'foo');
  t.is(sesOut.result.afterReflectSet, 'foo');

  // Both runtimes agree: the later importer still sees the original value.
  // The override claim ("foo.x = 'bar' overrides x as imported later") is
  // false in both Node.js and SES.
  t.deepEqual(nodeOut.seenByLaterImport, { namedX: 'foo', starX: 'foo' });
  t.deepEqual(sesOut.seenByLaterImport, { namedX: 'foo', starX: 'foo' });

  // Differences in how the protection is implemented:

  // 1. Property descriptor shape.
  //    Node.js exposes a data descriptor (writable: true, with a value).
  //    SES exposes an accessor descriptor (get/set, no value).
  t.deepEqual(nodeOut.result.descriptor, {
    value: 'foo',
    writable: true,
    enumerable: true,
    configurable: false,
  });
  t.deepEqual(sesOut.result.descriptor, {
    enumerable: true,
    configurable: false,
  });

  // 2. Frozen state.
  //    Node.js: namespace is non-extensible but NOT frozen
  //    (writable: true on its data properties is what unfreezes it).
  //    SES: namespace is fully frozen (accessor properties + frozen target).
  t.false(nodeOut.result.isFrozen);
  t.false(nodeOut.result.isExtensible);
  t.true(sesOut.result.isFrozen);
  t.false(sesOut.result.isExtensible);
});
