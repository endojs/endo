/* eslint-disable no-underscore-dangle */
import test from '@endo/ses-ava/prepare-endo.js';
import { CjsModuleSource } from '../src/cjs-module-source.js';

test('CjsModuleSource is a frozen constructor', t => {
  t.is(typeof CjsModuleSource, 'function');
  t.true(Object.isFrozen(CjsModuleSource));
  t.true(Object.isFrozen(CjsModuleSource.prototype));
});

test('CjsModuleSource requires new', t => {
  t.throws(() => CjsModuleSource(''), { instanceOf: TypeError });
});

test('CjsModuleSource rejects import statements', t => {
  t.throws(() => new CjsModuleSource(`import 'foo';`), {
    instanceOf: SyntaxError,
  });
});

test('CjsModuleSource produces a frozen record', t => {
  const ms = new CjsModuleSource(`exports.a = 1;`);
  t.true(Object.isFrozen(ms));
  t.true(Object.isFrozen(ms.imports));
  t.true(Object.isFrozen(ms.exports));
  t.true(Object.isFrozen(ms.reexports));
});

test('exports.name = value', t => {
  const ms = new CjsModuleSource(`exports.meaning = 42;`);
  t.true(ms.exports.includes('meaning'));
  t.true(ms.exports.includes('default'));
});

test('module.exports = function', t => {
  const ms = new CjsModuleSource(`module.exports = function () {};`);
  t.deepEqual([...ms.exports], ['default']);
});

test('module.exports = { a, b }', t => {
  const ms = new CjsModuleSource(`
    function a() {}
    module.exports = {a};
  `);
  t.true(ms.exports.includes('a'));
  t.true(ms.exports.includes('default'));
});

test('module.exports = require reexport', t => {
  const ms = new CjsModuleSource(`module.exports = require('./x.js');`);
  t.deepEqual([...ms.reexports], ['./x.js']);
  t.true(ms.imports.includes('./x.js'));
});

test('require specifiers are collected', t => {
  const ms = new CjsModuleSource(`
    const a = require('foo');
    const b = require('bar');
  `);
  t.true(ms.imports.includes('foo'));
  t.true(ms.imports.includes('bar'));
});

test('cjsFunctor wraps source', t => {
  const ms = new CjsModuleSource(`exports.x = 1;`);
  t.true(ms.cjsFunctor.startsWith('(function (require, exports, module,'));
  t.true(ms.cjsFunctor.includes('exports.x = 1'));
});

test('cjsFunctor includes $h_import param when import() is present', t => {
  const ms = new CjsModuleSource(`import('foo');`);
  t.true(ms.__needsImport__);
  t.true(ms.cjsFunctor.includes('$h'));
  t.true(ms.imports.includes('foo'));
});

test('sourceUrl option adds sourceURL comment', t => {
  const ms = new CjsModuleSource(`exports.x = 1;`, {
    sourceUrl: 'file:///test.js',
  });
  t.true(ms.cjsFunctor.includes('//# sourceURL=file:///test.js'));
});

test('string opts treated as sourceUrl', t => {
  const ms = new CjsModuleSource(`exports.x = 1;`, 'file:///test.js');
  t.true(ms.cjsFunctor.includes('//# sourceURL=file:///test.js'));
});

test('shebang is commented out', t => {
  const ms = new CjsModuleSource(`#!/usr/bin/env node\nexports.x = 1;`);
  t.true(ms.exports.includes('x'));
  t.true(ms.cjsFunctor.includes('//#!/usr/bin/env node'));
});

test('module.exports.name = value', t => {
  const ms = new CjsModuleSource(`module.exports.asdf = 'asdf';`);
  t.true(ms.exports.includes('asdf'));
});

test('esbuild hint', t => {
  const ms = new CjsModuleSource(`
    0 && (module.exports = {a, b, c}) && __exportStar(require('fs'));
  `);
  t.true(ms.exports.includes('a'));
  t.true(ms.exports.includes('b'));
  t.true(ms.exports.includes('c'));
  t.true(ms.reexports.includes('fs'));
});

test('__needsImport__ is false when no import()', t => {
  const ms = new CjsModuleSource(`const x = require('foo');`);
  t.false(ms.__needsImport__);
});

test('mixed quoted and unquoted destructured identifiers', t => {
  const ms = new CjsModuleSource(`
    function a() {}
    function b() {}
    function c() {}
    function d() {}
    module.exports = {"a": a, 'b': b, c: c, d};
  `);
  t.true(ms.exports.includes('a'));
  t.true(ms.exports.includes('b'));
  t.true(ms.exports.includes('c'));
  t.true(ms.exports.includes('d'));
});

test('module.exports reassignment clears reexports (last wins)', t => {
  const ms = new CjsModuleSource(`
    module.exports.asdf = 'asdf';
    exports = 'asdf';
    module.exports = require('./asdf');
    if (maybe)
      module.exports = require("./another");
  `);
  t.true(ms.exports.includes('asdf'));
  t.deepEqual([...ms.reexports], ['./another']);
});

test('TypeScript reexport helpers', t => {
  const ms = new CjsModuleSource(`
    "use strict";
    function __export(m) {
        for (const p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
    }
    Object.defineProperty(exports, "__esModule", { value: true });
    __export(require("external1"));
    tslib.__export(require("external2"));
    __exportStar(require("external3"));
    tslib1.__exportStar(require("external4"));
  `);
  t.true(ms.reexports.includes('external1'));
  t.true(ms.reexports.includes('external2'));
  t.true(ms.reexports.includes('external3'));
  t.true(ms.reexports.includes('external4'));
});

test('Object.defineProperty with value descriptor', t => {
  const ms = new CjsModuleSource(`
    Object.defineProperty(exports, 'namedExport', { enumerable: false, value: true });
    Object.defineProperty(module.exports, 'thing', { value: true });
    Object.defineProperty(exports, "other", { enumerable: true, value: true });
    Object.defineProperty(exports, "__esModule", { value: true });
  `);
  t.true(ms.exports.includes('namedExport'));
  t.true(ms.exports.includes('thing'));
  t.true(ms.exports.includes('other'));
  t.true(ms.exports.includes('__esModule'));
});

test('Object.defineProperty with safe getter', t => {
  const ms = new CjsModuleSource(`
    Object.defineProperty(exports, 'a', {
      enumerable: true,
      get: function () {
        return q.p;
      }
    });
  `);
  t.true(ms.exports.includes('a'));
});

test('Object.defineProperty with unsafe getter is excluded', t => {
  const ms = new CjsModuleSource(`
    Object.defineProperty(exports, 'd', {
      enumerable: true,
      get: function () {
        return dynamic();
      }
    });
  `);
  t.false(ms.exports.includes('d'));
});

test('exports bracket string assignment', t => {
  const ms = new CjsModuleSource(`exports['myExport'] = 42;`);
  t.true(ms.exports.includes('myExport'));
});

test('non-identifier export names are excluded', t => {
  const ms = new CjsModuleSource(`
    exports['not identifier'] = 'asdf';
    exports['@notidentifier'] = 'asdf';
  `);
  t.false(ms.exports.includes('not identifier'));
  t.false(ms.exports.includes('@notidentifier'));
});

test('strict reserved words as export names are excluded', t => {
  const ms = new CjsModuleSource(`exports.package = 'RESERVED!';`);
  t.false(ms.exports.includes('package'));
});

test('require in function arguments', t => {
  const ms = new CjsModuleSource(`
    let Mime = require('./Mime');
    Mime(require('./types/standard'), require('./types/other'));
  `);
  t.is(ms.imports.length, 3);
});

test('non-string require args are ignored', t => {
  const ms = new CjsModuleSource(`
    require(variable);
    require('valid');
  `);
  t.deepEqual([...ms.imports], ['valid']);
});

test('module.exports = { ...require spread reexport }', t => {
  const ms = new CjsModuleSource(`
    module.exports = {
      ...a,
      ...b,
      ...require('dep1'),
      c: d,
      ...require('dep2'),
      name
    };
  `);
  t.true(ms.exports.includes('c'));
  t.true(ms.exports.includes('name'));
  t.true(ms.reexports.includes('dep1'));
  t.true(ms.reexports.includes('dep2'));
});
