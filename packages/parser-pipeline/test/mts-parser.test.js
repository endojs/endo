import someTest from '@endo/ses-ava/prepare-endo.js';
import { createParsers } from '../src/parsers.js';
import nodeModule from 'node:module';

const supportsStripTypes =
  typeof nodeModule.stripTypeScriptTypes === 'function';
const test = supportsStripTypes ? someTest : someTest.failing;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

test('produces a valid ParseResult with types stripped', t => {
  const { sync } = createParsers();

  const source = `
    import { foo } from 'bar';
    import type { OnlyType } from 'unused';
    import { type OnlyType2 } from 'unused2';
    const x: number = foo();
    export const y = x as string;
    export type MyType = string | number;
    export interface IFoo { bar(): void }
  `;

  const result = sync.mts.parse(
    textEncoder.encode(source),
    'test',
    'file:///test.mts',
    'file:///',
    {},
  );

  t.is(result.parser, 'mts');
  t.truthy(result.record);
  t.truthy(result.bytes);

  const out = textDecoder.decode(result.bytes);

  // eslint-disable-next-line no-new-func
  t.notThrows(() => new Function(out), 'generated code is executable');

  // The type-only import and the value-only import differ:
  //   - `import { foo } from 'bar'` -> kept (value)
  //   - `import type { OnlyType } from 'unused'` -> module-source analyzer
  //     drops the binding-less import, but the specifier is still recorded.
  // The important thing is the runtime semantics are preserved: `bar` is
  // imported (it's a value), `unused` may or may not be (it was type-only).
  t.true([...result.record.imports].includes('bar'), 'value import preserved');

  // Exports: y is a value export. `MyType` and `IFoo` are types and must NOT
  // be in the runtime exports.
  const exports = [...result.record.exports].sort();
  t.deepEqual(exports, ['y'], 'only value exports survive strip');
});

test('strips generic call type arguments', t => {
  const { sync } = createParsers();

  const source = `
    function id<T>(x: T): T { return x; }
    export const result = id<number>(42);
  `;

  const result = sync.mts.parse(
    textEncoder.encode(source),
    'test',
    'file:///test.mts',
    'file:///',
    {},
  );

  const out = textDecoder.decode(result.bytes);
  // eslint-disable-next-line no-new-func
  t.notThrows(() => new Function(out), 'generated code is executable');
  // Strip whitespace-pads removed type arguments to preserve source positions,
  // so `id<number>(42)` becomes `id        (42)`. The call itself is intact;
  // we just normalize whitespace before asserting.
  t.regex(out.replace(/\s+/g, ' '), /id\s*\(42\)/, 'call expression preserved');
});

test('user visitor passes see post-strip AST', t => {
  /** @type {string[]} */
  const seenIdentifiers = [];

  const { sync } = createParsers({
    mts: {
      visitorFactories: [
        () => ({
          visitor: {
            Identifier(path) {
              seenIdentifiers.push(path.node.name);
            },
          },
        }),
      ],
    },
  });

  const source = `
    const x: number = 5;
    export const y = x;
  `;

  sync.mts.parse(
    textEncoder.encode(source),
    'test',
    'file:///test.mts',
    'file:///',
    {},
  );

  // Identifiers from the value-side: `x`, `y`. The `number` type identifier
  // should NOT show up, since strip removes it before parse.
  t.true(seenIdentifiers.includes('x'), 'value identifier x seen');
  t.true(seenIdentifiers.includes('y'), 'value identifier y seen');
  t.false(
    seenIdentifiers.includes('number'),
    'type identifier `number` is NOT seen by user visitors',
  );
});

test('onModuleComplete reports language as `mts`', t => {
  /** @type {string[]} */
  const languages = [];

  const { sync } = createParsers({
    onModuleComplete: ({ language }) => {
      languages.push(language);
    },
  });

  sync.mts.parse(
    textEncoder.encode(`export const x: number = 1;`),
    'test',
    'file:///test.mts',
    'file:///',
    {},
  );

  t.deepEqual(languages, ['mts']);
});

test('surfaces module-source analyzer errors normally', t => {
  // module-source's analyzer reports `import.meta` etc. through the same
  // path it does for mjs; the strip step is invisible to it. This is a
  // smoke test that strip doesn't break the analyzer's invariants.
  const { sync } = createParsers();

  t.notThrows(() => {
    sync.mts.parse(
      textEncoder.encode(`export const x = 1;`),
      'test',
      'file:///test.mts',
      'file:///',
      {},
    );
  });
});

test('throws a clear error on TS features outside the strip-only subset', t => {
  const { sync } = createParsers();

  // `enum` is not strip-only; stripTypeScriptTypes throws.
  t.throws(
    () => {
      sync.mts.parse(
        textEncoder.encode(`export enum Color { Red, Green, Blue }`),
        'test',
        'file:///enum.mts',
        'file:///',
        {},
      );
    },
    {
      // The error message comes from Node's stripTypeScriptTypes; we only
      // assert that *some* error is thrown that mentions the offending file
      // or the strip-only restriction. Different Node versions phrase this
      // differently, so match loosely.
      message: /TypeScript|enum|strip/i,
    },
  );
});

test('surfaces source maps to sourceMapHook (transitive through strip)', t => {
  /** @type {object|undefined} */
  let capturedMap;

  const { sync } = createParsers({
    mts: {
      visitorFactories: [
        () => ({
          // A minimal mutating pass so the generator produces a meaningful map.
          visitor: {
            Identifier(path) {
              if (path.node.name === 'rename_me') {
                path.node.name = 'renamed';
              }
            },
          },
        }),
      ],
    },
  });

  const source = `
    const rename_me: number = 1;
    export const x = rename_me;
  `;

  sync.mts.parse(
    textEncoder.encode(source),
    'test',
    'file:///test.mts',
    'file:///',
    {
      sourceMapHook: map => {
        capturedMap = map;
      },
    },
  );

  // Source-map hook fires; the map references positions from the *stripped*
  // source which (because strip whitespace-pads) line up with the original
  // TS source positions.
  t.truthy(capturedMap, 'sourceMapHook fired');
  t.true(
    Array.isArray(capturedMap.mappings) ||
      typeof capturedMap.mappings === 'string',
  );
});

test('parsing fails if source is not type-strippable', t => {
  const { sync } = createParsers();

  t.throws(
    () =>
      sync.mts.parse(
        textEncoder.encode(`export enum Color { Red, Green, Blue }`),
        'test',
        'file:///enum.mts',
        'file:///',
        {},
      ),
    {
      code: 'ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX',
    },
  );
});

test('mjs and cjs continue to work alongside mts', t => {
  const { sync } = createParsers({
    cjs: {
      finalizeRecord: record => ({
        imports: record.imports,
        exports: record.exports,
        reexports: record.reexports,
        execute: () => {},
      }),
    },
  });

  // Sanity: all three language parsers exist and are callable.
  t.truthy(sync.mjs);
  t.truthy(sync.cjs);
  t.truthy(sync.mts);

  const mjsResult = sync.mjs.parse(
    textEncoder.encode(`export const a = 1;`),
    'a',
    'file:///a.mjs',
    'file:///',
    {},
  );
  t.is(mjsResult.parser, 'mjs');

  const cjsResult = sync.cjs.parse(
    textEncoder.encode(`exports.b = 1;`),
    'b',
    'file:///b.cjs',
    'file:///',
    {},
  );
  t.is(cjsResult.parser, 'cjs');

  const mtsResult = sync.mts.parse(
    textEncoder.encode(`export const c: number = 1;`),
    'c',
    'file:///c.mts',
    'file:///',
    {},
  );
  t.is(mtsResult.parser, 'mts');
});

(supportsStripTypes ? someTest.failing : someTest)(
  `should throw error if Node.js ${process.version} does not support stripTypeScriptTypes`,
  t => {
    const { sync } = createParsers();

    t.throws(() => {
      sync.mts.parse(
        textEncoder.encode(`export const x = 1;`),
        'test',
        'file:///test.mts',
        'file:///',
        {},
      );
    });
  },
);
