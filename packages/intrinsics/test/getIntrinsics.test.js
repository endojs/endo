import test from 'tape';
import getIntrinsics from '..';

const { getPrototypeOf } = Object;

test('intrinsics - names', t => {
  t.plan(1);

  const instrinsics = getIntrinsics();

  t.deepEqual(
    Object.keys(instrinsics).sort(),
    [
      'Array',
      'ArrayBuffer',
      'ArrayBufferPrototype',
      'ArrayIteratorPrototype',
      'ArrayPrototype',
      'AsyncFunction',
      'AsyncFunctionPrototype',
      'AsyncGenerator',
      'AsyncGeneratorFunction',
      'AsyncGeneratorPrototype',
      'AsyncIteratorPrototype',
      'Atomics',
      'BigInt',
      'BigInt64Array',
      'BigUint64Array',
      'Boolean',
      'BooleanPrototype',
      'DataView',
      'DataViewPrototype',
      'Date',
      'DatePrototype',
      'Error',
      'ErrorPrototype',
      'EvalError',
      'EvalErrorPrototype',
      'Float32Array',
      'Float32ArrayPrototype',
      'Float64Array',
      'Float64ArrayPrototype',
      'Function',
      'FunctionPrototype',
      'Generator',
      'GeneratorFunction',
      'GeneratorPrototype',
      'Int16Array',
      'Int16ArrayPrototype',
      'Int32Array',
      'Int32ArrayPrototype',
      'Int8Array',
      'Int8ArrayPrototype',
      'IteratorPrototype',
      'JSON',
      'Map',
      'MapIteratorPrototype',
      'MapPrototype',
      'Math',
      'Number',
      'NumberPrototype',
      'Object',
      'ObjectPrototype',
      'Promise',
      'PromisePrototype',
      'Proxy',
      'RangeError',
      'RangeErrorPrototype',
      'ReferenceError',
      'ReferenceErrorPrototype',
      'Reflect',
      'RegExp',
      'RegExpPrototype',
      'RegExpStringIteratorPrototype',
      'Set',
      'SetIteratorPrototype',
      'SetPrototype',
      'SharedArrayBuffer',
      'SharedArrayBufferPrototype',
      'String',
      'StringIteratorPrototype',
      'StringPrototype',
      'Symbol',
      'SymbolPrototype',
      'SyntaxError',
      'SyntaxErrorPrototype',
      'ThrowTypeError',
      'TypeError',
      'TypeErrorPrototype',
      'TypedArray',
      'TypedArrayPrototype',
      'URIError',
      'URIErrorPrototype',
      'Uint16Array',
      'Uint16ArrayPrototype',
      'Uint32Array',
      'Uint32ArrayPrototype',
      'Uint8Array',
      'Uint8ArrayPrototype',
      'Uint8ClampedArray',
      'Uint8ClampedArrayPrototype',
      'WeakMap',
      'WeakMapPrototype',
      'WeakSet',
      'WeakSetPrototype',
      'decodeURI',
      'decodeURIComponent',
      'encodeURI',
      'encodeURIComponent',
      'escape',
      'eval',
      'isFinite',
      'isNaN',
      'parseFloat',
      'parseInt',
      'unescape',
    ].sort(),
  );
});

test('intrinsics - anonymous', t => {
  t.plan(14);

  const instrinsics = getIntrinsics();

  // eslint-disable-next-line no-new-wrappers
  const StringIteratorObject = new String()[Symbol.iterator]();
  const StringIteratorPrototype = getPrototypeOf(StringIteratorObject);
  t.equal(
    instrinsics.StringIteratorPrototype,
    StringIteratorPrototype,
    'StringIteratorPrototype',
  );

  // eslint-disable-next-line no-new-wrappers
  const RegExpStringIteratorObject = new RegExp()[Symbol.matchAll]();
  const RegExpStringIteratorPrototype = getPrototypeOf(
    RegExpStringIteratorObject,
  );
  t.equal(
    instrinsics.RegExpStringIteratorPrototype,
    RegExpStringIteratorPrototype,
    'RegExpStringIteratorPrototype',
  );

  // eslint-disable-next-line no-array-constructor
  const ArrayIteratorInstance = new Array()[Symbol.iterator]();
  const ArrayIteratorPrototype = getPrototypeOf(ArrayIteratorInstance);
  t.equal(
    instrinsics.ArrayIteratorPrototype,
    ArrayIteratorPrototype,
    'ArrayIteratorPrototype',
  );

  const MapIteratorObject = new Map()[Symbol.iterator]();
  const MapIteratorPrototype = getPrototypeOf(MapIteratorObject);
  t.equal(
    instrinsics.MapIteratorPrototype,
    MapIteratorPrototype,
    'MapIteratorPrototype',
  );

  const SetIteratorObject = new Set()[Symbol.iterator]();
  const SetIteratorPrototype = getPrototypeOf(SetIteratorObject);
  t.equal(
    instrinsics.SetIteratorPrototype,
    SetIteratorPrototype,
    'SetIteratorPrototype',
  );

  const IteratorPrototype = getPrototypeOf(ArrayIteratorPrototype);
  t.equal(
    instrinsics.IteratorPrototype,
    IteratorPrototype,
    'IteratorPrototype',
  );

  const TypedArray = getPrototypeOf(Int8Array);
  t.equal(instrinsics.TypedArray, TypedArray, 'TypedArray');

  // eslint-disable-next-line func-names, no-empty-function
  const AsyncFunctionInstance = async function() {};
  const AsyncFunction = getPrototypeOf(AsyncFunctionInstance).constructor;
  t.equal(instrinsics.AsyncFunction, AsyncFunction, 'AsyncFunction');

  // eslint-disable-next-line func-names, no-empty-function
  const GeneratorFunctionInstance = function*() {};
  const GeneratorFunction = getPrototypeOf(GeneratorFunctionInstance)
    .constructor;
  t.equal(
    instrinsics.GeneratorFunction,
    GeneratorFunction,
    'GeneratorFunction',
  );

  // eslint-disable-next-line func-names, no-empty-function
  const AsyncGeneratorFunctionInstance = async function*() {};
  const AsyncGeneratorFunction = getPrototypeOf(AsyncGeneratorFunctionInstance)
    .constructor;
  t.equal(
    instrinsics.AsyncGeneratorFunction,
    AsyncGeneratorFunction,
    'AsyncGeneratorFunction',
  );

  const AsyncGenerator = AsyncGeneratorFunction.prototype;
  t.equal(instrinsics.AsyncGenerator, AsyncGenerator, 'AsyncGenerator');

  const AsyncGeneratorPrototype = AsyncGenerator.prototype;
  t.equal(
    instrinsics.AsyncGeneratorPrototype,
    AsyncGeneratorPrototype,
    'AsyncGeneratorPrototype',
  );

  const AsyncIteratorPrototype = getPrototypeOf(AsyncGeneratorPrototype);
  t.equal(
    instrinsics.AsyncIteratorPrototype,
    AsyncIteratorPrototype,
    'AsyncIteratorPrototype',
  );

  // eslint-disable-next-line func-names
  const ThrowTypeError = (function() {
    // eslint-disable-next-line prefer-rest-params
    return Object.getOwnPropertyDescriptor(arguments, 'callee').get;
  })();
  t.equal(instrinsics.ThrowTypeError, ThrowTypeError, 'ThrowTypeError');
});

test('intrinsics - named', t => {
  const instrinsics = getIntrinsics();

  // eslint-disable-next-line no-new-func
  const global = Function('return this')();

  for (const name of Object.keys(instrinsics)) {
    if (Object.prototype.hasOwnProperty.call(global, name)) {
      t.equal(instrinsics[name], global[name], name);
    } else if (name.endsWith('Prototype')) {
      const base = name.slice(0, -9);
      if (Object.prototype.hasOwnProperty.call(global, base)) {
        t.equal(instrinsics[name], getPrototypeOf(global[base]), name);
      } else {
        t.skip(name);
      }
    } else {
      t.skip(name);
    }
  }

  t.end();
});
