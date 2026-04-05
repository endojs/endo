/* eslint-disable no-underscore-dangle */
import test from '@endo/ses-ava/prepare-endo.js';
import { parse as parseBabel } from '@babel/parser';
import babelTraverse from '@babel/traverse';
import { generate as generateBabel } from '@babel/generator';
import { createCjsModuleSourcePasses } from '../src/visitor-passes.js';
import { CjsModuleSource } from '../src/cjs-module-source.js';

const { default: traverseBabel } = babelTraverse;

const parseCjs = source =>
  parseBabel(source, {
    sourceType: 'commonjs',
    tokens: true,
    createParenthesizedExpressions: true,
  });

const runAnalysis = source => {
  const passes = createCjsModuleSourcePasses();
  const ast = parseCjs(source);
  traverseBabel(ast, passes.analyzerPass.visitor);
  return passes.analyzerPass.getResults();
};

const runFull = source => {
  const passes = createCjsModuleSourcePasses();
  const ast = parseCjs(source);
  traverseBabel(ast, passes.analyzerPass.visitor);
  traverseBabel(ast, passes.transformPass.visitor);
  const { code } = generateBabel(
    ast,
    {
      // @ts-expect-error undocumented
      experimental_preserveFormat: true,
      preserveFormat: true,
      retainLines: true,
      verbatim: true,
    },
    source,
  );
  return {
    analysis: passes.analyzerPass.getResults(),
    record: passes.buildRecord(code, 'file:///test.js'),
  };
};

test('createCjsModuleSourcePasses returns correct shape', t => {
  const passes = createCjsModuleSourcePasses();
  t.is(typeof passes.analyzerPass, 'object');
  t.is(typeof passes.analyzerPass.visitor, 'object');
  t.is(typeof passes.analyzerPass.getResults, 'function');
  t.is(typeof passes.transformPass, 'object');
  t.is(typeof passes.transformPass.visitor, 'object');
  t.is(typeof passes.buildRecord, 'function');
});

test('analyze exports.name = value', t => {
  const result = runAnalysis(`exports.meaning = 42;`);
  t.true(result.exports.includes('meaning'));
});

test('analyze module.exports = function (default)', t => {
  const result = runAnalysis(`module.exports = function () {};`);
  t.deepEqual(result.exports, ['default']);
});

test('analyze module.exports = { a }', t => {
  const result = runAnalysis(`
    function a() {}
    module.exports = {a};
  `);
  t.true(result.exports.includes('a'));
});

test('analyze module.exports = require (reexport)', t => {
  const result = runAnalysis(`module.exports = require('./x.js');`);
  t.deepEqual(result.reexports, ['./x.js']);
  t.true(result.requires.includes('./x.js'));
});

test('analyze require calls', t => {
  const result = runAnalysis(`
    const a = require('foo');
    const b = require('bar');
  `);
  t.true(result.requires.includes('foo'));
  t.true(result.requires.includes('bar'));
});

test('analyze import() calls', t => {
  const result = runAnalysis(`import('dynamic-dep');`);
  t.deepEqual(result.imports, ['dynamic-dep']);
  t.true(result.needsImport);
});

test('analyze esbuild hint', t => {
  const result = runAnalysis(`
    0 && (module.exports = {a, b, c}) && __exportStar(require('fs'));
  `);
  t.true(result.exports.includes('a'));
  t.true(result.exports.includes('b'));
  t.true(result.exports.includes('c'));
  t.true(result.reexports.includes('fs'));
});

test('analyze Object.defineProperty with value', t => {
  const result = runAnalysis(`
    Object.defineProperty(exports, 'namedExport', { value: true });
    Object.defineProperty(exports, "__esModule", { value: true });
  `);
  t.true(result.exports.includes('namedExport'));
  t.true(result.exports.includes('__esModule'));
});

test('analyze Object.defineProperty with safe getter', t => {
  const result = runAnalysis(`
    Object.defineProperty(exports, 'a', {
      enumerable: true,
      get: function () { return q.p; }
    });
  `);
  t.true(result.exports.includes('a'));
});

test('analyze Object.defineProperty with unsafe getter excluded', t => {
  const result = runAnalysis(`
    Object.defineProperty(exports, 'd', {
      enumerable: true,
      get: function () { return dynamic(); }
    });
  `);
  t.false(result.exports.includes('d'));
});

test('analyze TypeScript reexport helpers', t => {
  const result = runAnalysis(`
    __export(require("external1"));
    tslib.__export(require("external2"));
    __exportStar(require("external3"));
  `);
  t.true(result.reexports.includes('external1'));
  t.true(result.reexports.includes('external2'));
  t.true(result.reexports.includes('external3'));
});

test('analyze exports bracket notation', t => {
  const result = runAnalysis(`exports['myExport'] = 42;`);
  t.true(result.exports.includes('myExport'));
});

test('analyze non-identifier export names excluded', t => {
  const result = runAnalysis(`
    exports['not identifier'] = 'a';
    exports['@bad'] = 'b';
  `);
  t.false(result.exports.includes('not identifier'));
  t.false(result.exports.includes('@bad'));
});

test('analyze strict reserved words excluded', t => {
  const result = runAnalysis(`exports.package = 'RESERVED!';`);
  t.false(result.exports.includes('package'));
});

test('analyze module.exports.name', t => {
  const result = runAnalysis(`module.exports.asdf = 'asdf';`);
  t.true(result.exports.includes('asdf'));
});

test('analyze require in function args', t => {
  const result = runAnalysis(`
    let Mime = require('./Mime');
    Mime(require('./types/standard'), require('./types/other'));
  `);
  t.is(result.requires.length, 3);
});

test('analyze spread reexport', t => {
  const result = runAnalysis(`
    module.exports = {
      ...require('dep1'),
      c: d,
      ...require('dep2'),
      name
    };
  `);
  t.true(result.exports.includes('c'));
  t.true(result.exports.includes('name'));
  t.true(result.reexports.includes('dep1'));
  t.true(result.reexports.includes('dep2'));
});

test('analyze non-string require args are ignored', t => {
  const result = runAnalysis(`
    require(variable);
    require('valid');
  `);
  t.deepEqual(result.requires, ['valid']);
});

test('module.exports reassignment clears reexports', t => {
  const result = runAnalysis(`
    module.exports = require('./asdf');
    module.exports = require("./another");
  `);
  t.deepEqual(result.reexports, ['./another']);
});

test('Babel reexport pattern: Object.keys(x).forEach', t => {
  const result = runAnalysis(`
    var _external = require("external");
    Object.keys(_external).forEach(function (key) {
      if (key === "default" || key === "__esModule") return;
      exports[key] = _external[key];
    });
  `);
  t.true(result.reexports.includes('external'));
});

test('Babel reexport with _interopRequireWildcard', t => {
  const result = runAnalysis(`
    var _Accordion = _interopRequireWildcard(require("./Accordion"));
    Object.keys(_Accordion).forEach(function (key) {
      if (key === "default" || key === "__esModule") return;
      if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
      Object.defineProperty(exports, key, {
        enumerable: true,
        get: function () {
          return _Accordion[key];
        }
      });
    });
  `);
  t.true(result.reexports.includes('./Accordion'));
});

test('Babel reexport with defineProperty getter', t => {
  const result = runAnalysis(`
    var _external2 = require("external2");
    Object.keys(_external2).forEach(function (key) {
      if (key === "default" || key === "__esModule") return;
      Object.defineProperty(exports, key, {
        enumerable: true,
        get: function () {
          return _external2[key];
        }
      });
    });
  `);
  t.true(result.reexports.includes('external2'));
});

test('buildRecord produces correct shape', t => {
  const { record } = runFull(`
    const a = require('foo');
    exports.x = a;
  `);
  t.truthy(record.cjsFunctor);
  t.true(typeof record.cjsFunctor === 'string');
  t.true(record.cjsFunctor.startsWith('(function (require, exports, module,'));
  t.truthy(record.imports);
  t.truthy(record.exports);
  t.true(record.exports.includes('default'));
});

test('buildRecord includes sourceUrl', t => {
  const { record } = runFull(`exports.x = 1;`);
  t.true(record.cjsFunctor.includes('//# sourceURL=file:///test.js'));
});

test('buildRecord matches CjsModuleSource output', t => {
  const source = `
    const a = require('foo');
    exports.x = a;
    module.exports.y = 2;
  `;
  const ms = new CjsModuleSource(source, { sourceUrl: 'file:///test.js' });
  const { record } = runFull(source);

  t.deepEqual([...ms.imports].sort(), [...record.imports].sort());
  t.deepEqual([...ms.exports].sort(), [...record.exports].sort());
  t.deepEqual([...ms.reexports].sort(), [...record.reexports].sort());
  t.is(ms.__needsImport__, record.__needsImport__);
});

test('transform rewrites import() to hidden identifier', t => {
  const { record } = runFull(`import('foo');`);
  t.true(record.__needsImport__);
  // The hidden identifier ($h͏_import) should be present, replacing the bare
  // `import` keyword callee. We can't just check for absence of "import("
  // because the hidden identifier itself contains "import" as a substring.
  t.regex(record.cjsFunctor, /\$h.*_import/);
});

test('Getter opt-outs filter from exports', t => {
  const result = runAnalysis(`
    Object.defineProperty(exports, 'a', {
      enumerable: true,
      get: function () { return q.p; }
    });
    Object.defineProperty(exports, 'b', {
      enumerable: false,
      get: function () { return dynamic(); }
    });
  `);
  t.true(result.exports.includes('a'));
  t.false(result.exports.includes('b'));
});

test('mixed quoted and unquoted destructured identifiers', t => {
  const result = runAnalysis(`
    module.exports = {"a": a, 'b': b, c: c, d};
  `);
  t.true(result.exports.includes('a'));
  t.true(result.exports.includes('b'));
  t.true(result.exports.includes('c'));
  t.true(result.exports.includes('d'));
});
