import { assert } from './assert.js';
import { getPrototypeOf } from './commons.js';

/**
 * checkAnonIntrinsics()
 * Ensure that the rootAnonIntrinsics are consistent with specs. These
 * tests are necesary to ensure that sampling was correctly done.
 */

export function checkAnonIntrinsics(intrinsics) {
  const {
    FunctionPrototypeConstructor,
    ArrayIteratorPrototype,
    AsyncFunction,
    AsyncGenerator,
    AsyncGeneratorFunction,
    AsyncGeneratorPrototype,
    AsyncIteratorPrototype,
    Generator,
    GeneratorFunction,
    IteratorPrototype,
    MapIteratorPrototype,
    RegExpStringIteratorPrototype,
    SetIteratorPrototype,
    StringIteratorPrototype,
    ThrowTypeError,
    TypedArray,
  } = intrinsics;

  // 9.2.4.1 %ThrowTypeError%

  assert(
    getPrototypeOf(ThrowTypeError) === Function.prototype,
    'ThrowTypeError.__proto__ should be Function.prototype',
  );

  // 21.1.5.2 The %StringIteratorPrototype% Object

  assert(
    getPrototypeOf(StringIteratorPrototype) === IteratorPrototype,
    'StringIteratorPrototype.__proto__ should be IteratorPrototype',
  );

  // 21.2.7.1 The %RegExpStringIteratorPrototype% Object

  assert(
    getPrototypeOf(RegExpStringIteratorPrototype) === IteratorPrototype,
    'RegExpStringIteratorPrototype.__proto__ should be IteratorPrototype',
  );

  // 22.2.1 The %TypedArray% Intrinsic Object

  // http://bespin.cz/~ondras/html/classv8_1_1ArrayBufferView.html
  // has me worried that someone might make such an intermediate
  // object visible.
  assert(
    getPrototypeOf(TypedArray) === Function.prototype,

    'TypedArray.__proto__ should be Function.prototype',
  );

  // 23.1.5.2 The %MapIteratorPrototype% Object

  assert(
    getPrototypeOf(MapIteratorPrototype) === IteratorPrototype,
    'MapIteratorPrototype.__proto__ should be IteratorPrototype',
  );

  // 23.2.5.2 The %SetIteratorPrototype% Object

  assert(
    getPrototypeOf(SetIteratorPrototype) === IteratorPrototype,
    'SetIteratorPrototype.__proto__ should be IteratorPrototype',
  );

  // 25.1.2 The %IteratorPrototype% Object

  assert(
    getPrototypeOf(IteratorPrototype) === Object.prototype,
    'IteratorPrototype.__proto__ should be Object.prototype',
  );

  // 25.1.3 The %AsyncIteratorPrototype% Object

  assert(
    getPrototypeOf(AsyncIteratorPrototype) === Object.prototype,
    'AsyncIteratorPrototype.__proto__ should be Object.prototype',
  );

  // 22.1.5.2 The %ArrayIteratorPrototype% Object

  assert(
    getPrototypeOf(ArrayIteratorPrototype) === IteratorPrototype,
    'AsyncIteratorPrototype.__proto__ should be IteratorPrototype',
  );

  // 25.2.2 Properties of the GeneratorFunction Constructor

  // Use Function.prototype.constructor in case Function has been tamed
  assert(
    getPrototypeOf(GeneratorFunction) === FunctionPrototypeConstructor,
    'GeneratorFunction.__proto__ should be Function',
  );

  assert(
    GeneratorFunction.name === 'GeneratorFunction',
    'GeneratorFunction.name should be "GeneratorFunction"',
  );

  // 25.2.3 Properties of the GeneratorFunction Prototype Object

  assert(
    getPrototypeOf(Generator) === Function.prototype,
    'Generator.__proto__ should be Function.prototype',
  );

  // 25.3.1 The AsyncGeneratorFunction Constructor

  // Use Function.prototype.constructor in case Function has been tamed
  assert(
    getPrototypeOf(AsyncGeneratorFunction) === FunctionPrototypeConstructor,
    'AsyncGeneratorFunction.__proto__ should be Function',
  );
  assert(
    AsyncGeneratorFunction.name === 'AsyncGeneratorFunction',
    'AsyncGeneratorFunction.name should be "AsyncGeneratorFunction"',
  );

  // 25.3.3 Properties of the AsyncGeneratorFunction Prototype Object

  assert(
    getPrototypeOf(AsyncGenerator) === Function.prototype,
    'AsyncGenerator.__proto__ should be Function.prototype',
  );

  // 25.5.1 Properties of the AsyncGenerator Prototype Object

  assert(
    getPrototypeOf(AsyncGeneratorPrototype) === AsyncIteratorPrototype,
    'AsyncGeneratorPrototype.__proto__ should be AsyncIteratorPrototype',
  );

  // 25.7.1 The AsyncFunction Constructor

  // Use Function.prototype.constructor in case Function has been tamed
  assert(
    getPrototypeOf(AsyncFunction) === FunctionPrototypeConstructor,
    'AsyncFunction.__proto__ should be Function',
  );
  assert(
    AsyncFunction.name === 'AsyncFunction',
    'AsyncFunction.name should be "AsyncFunction"',
  );
}
