// @ts-nocheck
import test from 'ava';
import '../index.js';
import permitsIntrinsics from '../src/permits-intrinsics.js';

// eslint-disable-next-line no-eval
if (!eval.toString().includes('native code')) {
  throw TypeError('Module "esm" enabled: aborting');
}

// This test as stated no longer makes sense, now that `permitsIntrinsics`
// decodes symbol strings using the real `globalThis.Symbol` rather than
// `intrinsics.Symbol`. But I left this in as a `test.skip` in case anyone
// wants to rescure some of the purpose of this test.
test.skip('permitsIntrinsics - Well-known symbols', t => {
  const SymbolIterator = Symbol('Symbol.iterator');
  const RogueSymbolIterator = Symbol('Symbol.iterator');
  const ArrayProto = { [RogueSymbolIterator]() {} };
  const StringProto = { [SymbolIterator]() {} };
  const StringProtoIterator = StringProto[SymbolIterator];
  const intrinsics = Object.freeze({
    __proto__: null,
    Symbol: {
      __proto__: Function.prototype,
      // Well-known symbol under test
      iterator: SymbolIterator,
      // Needed symbol found on %FunctionPrototype%
      hasInstance: Symbol.hasInstance,
    },
    Array: {
      __proto__: Function.prototype,
      prototype: ArrayProto,
    },
    String: {
      __proto__: Function.prototype,
      prototype: StringProto,
    },
    // Required intrinsics
    '%ArrayPrototype%': ArrayProto,
    '%StringPrototype%': StringProto,
    '%FunctionPrototype%': Function.prototype,
    // Yes, this is clearly not inert
    '%InertFunction%': Function.prototype.constructor,
    '%ObjectPrototype%': Object.prototype,
    Object,
  });
  permitsIntrinsics(intrinsics, () => {});
  t.is(
    ArrayProto[RogueSymbolIterator],
    undefined,
    `Well-known Symbol look-alike should have been removed`,
  );
  t.is(
    StringProto[SymbolIterator],
    StringProtoIterator,
    `Well-known Symbol is kept`,
  );
});
