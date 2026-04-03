import test from '@endo/ses-ava/prepare-endo.js';
import { createComposedParser } from '../src/composed-parser.js';

/**
 * @import {RecordBuilder} from '../src/types/external.js'
 */

const textEncoder = new TextEncoder();

const encode = source => textEncoder.encode(source);

/** @returns {RecordBuilder} */
const stubRecordBuilder = () =>
  /** @type {RecordBuilder} */ (
    (code, _location) =>
      /** @type {any} */ ({
        imports: [],
        exports: [],
        reexports: [],
        __syncModuleProgram__: code,
        __liveExportMap__: {},
        __fixedExportMap__: {},
        __reexportMap__: {},
      })
  );

test('createComposedParser returns an object with a parse method', t => {
  const parser = createComposedParser(stubRecordBuilder(), {});
  t.is(typeof parser.parse, 'function');
});

test('parse runs analyzer visitors and collects results via getResults', t => {
  const identifiers = [];
  const parser = createComposedParser(stubRecordBuilder(), {
    analyzerFactories: [
      (_location, _specifier) => ({
        visitor: {
          Identifier(path) {
            identifiers.push(path.node.name);
          },
        },
        getResults: () => identifiers.slice(),
      }),
    ],
    onModuleComplete: ({ analyzerResults: [result] }) => {
      t.true(Array.isArray(result));
      t.true(result.length > 0);
    },
  });

  const source = `import { foo } from 'bar'; export const x = foo();`;
  parser.parse(encode(source), 'test-specifier', 'file:///test.js', 'file:///');
  t.true(identifiers.length > 0);
});

test('parse runs transform visitors that mutate the AST', t => {
  let sawTransform = false;
  const parser = createComposedParser(stubRecordBuilder(), {
    transformFactories: [
      (_location, _specifier) => ({
        visitor: {
          StringLiteral(path) {
            if (path.node.value === 'hello') {
              path.node.value = 'goodbye';
              sawTransform = true;
            }
          },
        },
      }),
    ],
  });

  const source = `export const x = 'hello';`;
  const result = parser.parse(
    encode(source),
    'test-specifier',
    'file:///test.js',
    'file:///',
  );
  t.true(sawTransform);
  const output = new TextDecoder().decode(result.bytes);
  t.true(output.includes('goodbye'));
});

test('analyzers run before transforms', t => {
  const order = [];
  const parser = createComposedParser(stubRecordBuilder(), {
    analyzerFactories: [
      () => ({
        visitor: {
          Program() {
            order.push('analyzer');
          },
        },
        getResults: () => null,
      }),
    ],
    transformFactories: [
      () => ({
        visitor: {
          Program() {
            order.push('transform');
          },
        },
      }),
    ],
  });

  parser.parse(
    encode(`export const x = 1;`),
    'spec',
    'file:///test.js',
    'file:///',
  );
  t.deepEqual(order, ['analyzer', 'transform']);
});

test('sourcePreprocessor modifies source before parsing', t => {
  let sawComment = false;
  const parser = createComposedParser(stubRecordBuilder(), {
    sourcePreprocessor: source => source.replace('#!hashbang', '// hashbang'),
    analyzerFactories: [
      () => ({
        visitor: {
          Program(path) {
            const firstLine = /** @type {any} */ (path.parent).comments?.[0]
              ?.value;
            if (firstLine && firstLine.includes('hashbang')) {
              sawComment = true;
            }
          },
        },
        getResults: () => sawComment,
      }),
    ],
  });

  parser.parse(
    encode(`#!hashbang\nexport const x = 1;`),
    'spec',
    'file:///test.js',
    'file:///',
  );
  t.true(sawComment, 'preprocessor should have converted hashbang to comment');
});

test('recordBuilder is called with generated code', t => {
  let recordBuilderCalled = false;

  /** @type {RecordBuilder} */
  const myRecordBuilder = (generatedCode, location) => {
    recordBuilderCalled = true;
    t.is(typeof generatedCode, 'string');
    t.is(location, 'file:///test.js');
    return /** @type {any} */ ({ myRecord: true });
  };

  const parser = createComposedParser(myRecordBuilder, {});

  const result = parser.parse(
    encode(`export const x = 1;`),
    'spec',
    'file:///test.js',
    'file:///',
  );
  t.true(recordBuilderCalled);
  t.deepEqual(result.record, { myRecord: true });
});

test('onModuleComplete receives location, specifier, and analyzer results', t => {
  let completionData;
  const parser = createComposedParser(stubRecordBuilder(), {
    analyzerFactories: [
      () => ({
        visitor: {},
        getResults: () => 42,
      }),
      () => ({
        visitor: {},
        getResults: () => 'hello',
      }),
    ],
    onModuleComplete: data => {
      completionData = data;
    },
  });

  parser.parse(
    encode(`export const x = 1;`),
    'my-specifier',
    'file:///my-module.js',
    'file:///',
  );

  t.like(completionData, {
    location: 'file:///my-module.js',
    specifier: 'my-specifier',
    analyzerResults: [42, 'hello'],
  });
});
