import test from 'ava';

import parserJson from '../src/parse-json.js';
// import parserText from '../src/parse-text.js';
// import parserBytes from '../src/parse-bytes.js';
import parserArchiveCjs from '../src/parse-archive-cjs.js';
import parserArchiveMjs from '../src/parse-archive-mjs.js';

import mjsSupport from '../src/bundle-mjs.js';
import cjsSupport from '../src/bundle-cjs.js';
import jsonSupport from '../src/bundle-json.js';

const textEncoder = new TextEncoder();

const tests = [
  {
    name: 'pre-mjs-json',
    parser: parserArchiveMjs,
    bundlerKit: mjsSupport,
    assertions: (t, kit) => {
      t.deepEqual(kit.getCells(), ['default', 'a', 'x']);
      t.deepEqual(kit.reexportedCells, [
        ['<index for self>', '<index for: ./b>'],
      ]);
      t.is(
        kit.getReexportsWiring().trim(),
        'Object.defineProperties(cells[<index for self>], {"z": { value: cells[<index for: x>]["x"] } });',
      );
    },
    sample: `
      import rea from './a';
      export * from './b';
      export { x as z } from 'x';
      export const a = 1;
      export default a;
      import.meta.uttered
    `,
  },
  {
    name: 'pre-cjs-json',
    parser: parserArchiveCjs,
    bundlerKit: cjsSupport,
    assertions: (t, kit) => {
      t.deepEqual(kit.getCells(), ['a', 'b', 'default']);
      t.is(kit.reexportedCells, undefined);
    },
    sample: `
      const a = require('a');
      const b = 1
      module.exports = { a, b };
    `,
  },
  {
    name: 'json',
    parser: parserJson,
    bundlerKit: jsonSupport,
    assertions: (t, kit) => {
      t.deepEqual(kit.getCells(), ['default']);
      t.is(kit.reexportedCells, undefined);
    },
    sample: `
      { "name": "foo" }
    `,
  },
];

tests.forEach(({ name, parser, bundlerKit, sample, assertions }) => {
  test(`bundler kit / ${name}`, async t => {
    const module = await parser.parse(
      textEncoder.encode(sample),
      '_specifier',
      '_location',
      '_packageLocation',
    );

    const { imports = [], reexports = [] } = module.record;
    const kit = bundlerKit.getBundlerKit({
      index: '<index for self>',
      indexedImports: Object.fromEntries(
        [...imports, ...reexports].map(importSpecifier => [
          importSpecifier,
          `<index for: ${importSpecifier}>`,
        ]),
      ),
      record: module.record,
    });

    assertions(t, kit);

    // all kits need to pass these:
    t.is(typeof bundlerKit.runtime, 'string');

    t.is(typeof kit.getFunctor, 'function');
    t.is(typeof kit.getCells, 'function');
    t.is(typeof kit.getReexportsWiring, 'function');
    t.is(typeof kit.getFunctorCall, 'function');

    t.is(typeof kit.getFunctor(), 'string');
    t.true(Array.isArray(kit.getCells()));
    t.is(typeof kit.getReexportsWiring(), 'string');
    t.is(typeof kit.getFunctorCall(), 'string');
  });
});
