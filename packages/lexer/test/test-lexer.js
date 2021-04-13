import test from 'ava';
import { analyzeCommonJS } from '../src/lexer.js';

test('analyze exports', t => {
  const { exports, reexports } = analyzeCommonJS(`
    exports.meaning = 42;
  `);
  t.deepEqual(exports, ['meaning']);
  t.deepEqual(reexports, []);
});

test('analyze default export figure', t => {
  const { exports, reexports } = analyzeCommonJS(`
    module.exports = function () {};
  `);
  t.deepEqual(exports, ['default']);
  t.deepEqual(reexports, []);
});

test('analyze exported restructured name', t => {
  const { exports, reexports } = analyzeCommonJS(`
    function a() {}
    module.exports = {a};
  `);
  t.deepEqual(exports, ['a']);
  t.deepEqual(reexports, []);
});

test('analyze exported quoted identifier to identifier', t => {
  const { exports, reexports } = analyzeCommonJS(`
    function a() {}
    module.exports = {"a": a};
  `);
  t.deepEqual(exports, ['a']);
  t.deepEqual(reexports, []);
});

test('analyze mix of quoted and unquoted destructed identifiers', t => {
  const { exports, reexports } = analyzeCommonJS(`
    function a() {}
    function b() {}
    function c() {}
    function d() {}
    module.exports = {"a": a, 'b': b, c: c, d};
  `);
  t.deepEqual(exports, ['a', 'b', 'c', 'd']);
  t.deepEqual(reexports, []);
});

test('analyze reexports', t => {
  const { exports, reexports } = analyzeCommonJS(`
    module.exports = require('./x.js');
  `);
  t.deepEqual(exports, []);
  t.deepEqual(reexports, ['./x.js']);
});
