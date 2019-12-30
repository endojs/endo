// Adapted from CoreJS Copyright (c) 2014-2018 Denis Pushkarev.
// This code is governed by the MIT license found in the LICENSE file.
import test from 'tape';
import getAnonIntrinsics from '../src/main';

const { getPrototypeOf } = Object;
const SymbolIterator = (typeof Symbol && Symbol.iterator) || '@@iterator';

test('anonymousIntrinsics', t => {
  t.plan(12);

  // eslint-disable-next-line no-new-func
  const global = Function('return this');
  const anonIntrinsics = getAnonIntrinsics(global);
  t.deepEqual(
    Object.keys(anonIntrinsics).sort(),
    [
      'StringIteratorPrototype',
      'ArrayIteratorPrototype',
      'MapIteratorPrototype',
      'SetIteratorPrototype',
      'IteratorPrototype',
      'TypedArray',
      'AsyncFunction',
      'GeneratorFunction',
      'AsyncGeneratorFunction',
      'AsyncIteratorPrototype',
      'ThrowTypeError',
    ].sort(),
  );

  // eslint-disable-next-line no-new-wrappers
  const StringIteratorObject = new String()[SymbolIterator]();
  const StringIteratorPrototype = getPrototypeOf(StringIteratorObject);
  t.equal(anonIntrinsics.StringIteratorPrototype, StringIteratorPrototype);

  // eslint-disable-next-line no-array-constructor
  const ArrayIteratorInstance = new Array()[SymbolIterator]();
  const ArrayIteratorPrototype = getPrototypeOf(ArrayIteratorInstance);
  t.equal(anonIntrinsics.ArrayIteratorPrototype, ArrayIteratorPrototype);

  const MapIteratorObject = new Map()[SymbolIterator]();
  const MapIteratorPrototype = getPrototypeOf(MapIteratorObject);
  t.equal(anonIntrinsics.MapIteratorPrototype, MapIteratorPrototype);

  const SetIteratorObject = new Set()[SymbolIterator]();
  const SetIteratorPrototype = getPrototypeOf(SetIteratorObject);
  t.equal(anonIntrinsics.SetIteratorPrototype, SetIteratorPrototype);

  const IteratorPrototype = getPrototypeOf(ArrayIteratorPrototype);
  t.equal(anonIntrinsics.IteratorPrototype, IteratorPrototype);

  const TypedArray = getPrototypeOf(Int8Array);
  t.equal(anonIntrinsics.TypedArray, TypedArray);

  // eslint-disable-next-line func-names, no-empty-function
  const AsyncFunctionInstance = async function() {};
  const AsyncFunction = AsyncFunctionInstance.constructor;
  t.equal(anonIntrinsics.AsyncFunction, AsyncFunction);

  // eslint-disable-next-line func-names, no-empty-function
  const GeneratorFunctionInstance = function*() {};
  const GeneratorFunction = GeneratorFunctionInstance.constructor;
  t.equal(anonIntrinsics.GeneratorFunction, GeneratorFunction);

  // eslint-disable-next-line func-names, no-empty-function
  const AsyncGeneratorFunctionInstance = async function*() {};
  const AsyncGeneratorFunction = AsyncGeneratorFunctionInstance.constructor;
  t.equal(anonIntrinsics.AsyncGeneratorFunction, AsyncGeneratorFunction);

  const AsyncGenerator = AsyncGeneratorFunction.prototype;
  const AsyncGeneratorPrototype = AsyncGenerator.prototype;
  const AsyncIteratorPrototype = getPrototypeOf(AsyncGeneratorPrototype);
  t.equal(anonIntrinsics.AsyncIteratorPrototype, AsyncIteratorPrototype);

  // eslint-disable-next-line no-new-func
  const ThrowTypeError = Function(`
    "use strict"; 
    return Object.getOwnPropertyDescriptor(arguments, "callee").get; 
  `)();
  t.equal(anonIntrinsics.ThrowTypeError, ThrowTypeError);
});
