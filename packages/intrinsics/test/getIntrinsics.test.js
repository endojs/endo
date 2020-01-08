import tap from 'tap';
import { getIntrinsics } from '../src/main.js';

const { test } = tap;

// TODO Module
// eslint-disable-next-line no-eval
if (!eval.toString().includes('native code')) {
  throw new TypeError('Module "esm" enabled: aborting');
}

const { getPrototypeOf } = Object;

function getAnonIntrinsics() {

  // eslint-disable-next-line no-new-wrappers
  const StringIteratorObject = new String()[Symbol.iterator]();
  const StringIteratorPrototype = getPrototypeOf(StringIteratorObject);


  // eslint-disable-next-line no-new-wrappers
  const RegExpStringIteratorObject = new RegExp()[Symbol.matchAll]();
  const RegExpStringIteratorPrototype = getPrototypeOf(
    RegExpStringIteratorObject,
  );

  // eslint-disable-next-line no-array-constructor
  const ArrayIteratorInstance = new Array()[Symbol.iterator]();
  const ArrayIteratorPrototype = getPrototypeOf(ArrayIteratorInstance);

  const MapIteratorObject = new Map()[Symbol.iterator]();
  const MapIteratorPrototype = getPrototypeOf(MapIteratorObject);

  const SetIteratorObject = new Set()[Symbol.iterator]();
  const SetIteratorPrototype = getPrototypeOf(SetIteratorObject);

  const IteratorPrototype = getPrototypeOf(ArrayIteratorPrototype);

  const TypedArray = getPrototypeOf(Int8Array);

  // eslint-disable-next-line func-names, no-empty-function
  const AsyncFunctionInstance = async function() {};
  const AsyncFunction = getPrototypeOf(AsyncFunctionInstance).constructor;

  // eslint-disable-next-line func-names, no-empty-function
  const GeneratorFunctionInstance = function*() {};
  const GeneratorFunction = getPrototypeOf(GeneratorFunctionInstance)
    .constructor;

  const Generator = GeneratorFunction.prototype;

  // eslint-disable-next-line func-names, no-empty-function
  const AsyncGeneratorFunctionInstance = async function*() {};
  const AsyncGeneratorFunction = getPrototypeOf(AsyncGeneratorFunctionInstance)
    .constructor;

  const AsyncGenerator = AsyncGeneratorFunction.prototype;

  const AsyncGeneratorPrototype = AsyncGenerator.prototype;

  const AsyncIteratorPrototype = getPrototypeOf(AsyncGeneratorPrototype);

  // eslint-disable-next-line func-names
  const ThrowTypeError = (function() {
    // eslint-disable-next-line prefer-rest-params
    return Object.getOwnPropertyDescriptor(arguments, 'callee').get;
  })();

  return {
    StringIteratorPrototype,
    RegExpStringIteratorPrototype,
    ArrayIteratorPrototype,
    MapIteratorPrototype,
    SetIteratorPrototype,
    IteratorPrototype,
    TypedArray,
    AsyncFunction,
    GeneratorFunction,
    Generator,
    AsyncGeneratorFunction,
    AsyncGenerator,
    AsyncGeneratorPrototype,
    AsyncIteratorPrototype,
    ThrowTypeError,
  };
}

test('intrinsics - getIntrinsics', t => {
  const instrinsics = getIntrinsics();

  // eslint-disable-next-line no-new-func
  const global = Function('return this')();
  const anonIntrinsics = getAnonIntrinsics();

  for (const name of Object.keys(instrinsics)) {
    if (Object.prototype.hasOwnProperty.call(anonIntrinsics, name)) {
      t.equal(instrinsics[name], anonIntrinsics[name], name);
    } else if (Object.prototype.hasOwnProperty.call(global, name)) {
      t.equal(instrinsics[name], global[name], name);
    } else if (name.endsWith('Prototype')) {
      const base = name.slice(0, -9);
      if (Object.prototype.hasOwnProperty.call(anonIntrinsics, base)) {
        t.equal(instrinsics[name], anonIntrinsics[base].prototype, name);
      } else if (Object.prototype.hasOwnProperty.call(global, base)) {
        t.equal(instrinsics[name], global[base].prototype, name);
      } else {
        t.skip(name);
      }
    } else {
      t.skip(name);
    }
  }

  t.end();
});
