import { getOwnPropertyDescriptor, getPrototypeOf } from './commons.js';

/**
 * Object.getConstructorOf()
 * Helper function to improve readability, similar to Object.getPrototypeOf().
 */
function getConstructorOf(obj) {
  return getPrototypeOf(obj).constructor;
}

/**
 * getAnonymousIntrinsics()
 * Get the intrinsics not otherwise reachable by named own property
 * traversal from the global object.
 */
export function getAnonymousIntrinsics() {
  const FunctionPrototypeConstructor = Function.prototype.constructor;

  const SymbolIterator = (typeof Symbol && Symbol.iterator) || '@@iterator';
  const SymbolMatchAll = (typeof Symbol && Symbol.matchAll) || '@@matchAll';

  // 9.2.4.1 %ThrowTypeError%

  // eslint-disable-next-line prefer-rest-params
  const ThrowTypeError = getOwnPropertyDescriptor(arguments, 'callee').get;

  // 21.1.5.2 The %StringIteratorPrototype% Object

  // eslint-disable-next-line no-new-wrappers
  const StringIteratorObject = new String()[SymbolIterator]();
  const StringIteratorPrototype = getPrototypeOf(StringIteratorObject);

  // 21.2.7.1 The %RegExpStringIteratorPrototype% Object

  const RegExpStringIterator = new RegExp()[SymbolMatchAll]();
  const RegExpStringIteratorPrototype = getPrototypeOf(RegExpStringIterator);

  // 22.1.5.2 The %ArrayIteratorPrototype% Object

  // eslint-disable-next-line no-array-constructor
  const ArrayIteratorObject = new Array()[SymbolIterator]();
  const ArrayIteratorPrototype = getPrototypeOf(ArrayIteratorObject);

  // 22.2.1 The %TypedArray% Intrinsic Object

  const TypedArray = getPrototypeOf(Float32Array);

  // 23.1.5.2 The %MapIteratorPrototype% Object

  const MapIteratorObject = new Map()[SymbolIterator]();
  const MapIteratorPrototype = getPrototypeOf(MapIteratorObject);

  // 23.2.5.2 The %SetIteratorPrototype% Object

  const SetIteratorObject = new Set()[SymbolIterator]();
  const SetIteratorPrototype = getPrototypeOf(SetIteratorObject);

  // 25.1.2 The %IteratorPrototype% Object

  const IteratorPrototype = getPrototypeOf(ArrayIteratorPrototype);

  // 25.2.1 The GeneratorFunction Constructor

  function* GeneratorFunctionInstance() {} // eslint-disable-line no-empty-function
  const GeneratorFunction = getConstructorOf(GeneratorFunctionInstance);

  // 25.2.3 Properties of the GeneratorFunction Prototype Object

  const Generator = GeneratorFunction.prototype;

  // 25.3.1 The AsyncGeneratorFunction Constructor

  async function* AsyncGeneratorFunctionInstance() {} // eslint-disable-line no-empty-function
  const AsyncGeneratorFunction = getConstructorOf(
    AsyncGeneratorFunctionInstance,
  );

  // 25.3.2.2 AsyncGeneratorFunction.prototype
  const AsyncGenerator = AsyncGeneratorFunction.prototype;
  // 25.5.1 Properties of the AsyncGenerator Prototype Object
  const AsyncGeneratorPrototype = AsyncGenerator.prototype;
  const AsyncIteratorPrototype = getPrototypeOf(AsyncGeneratorPrototype);

  // 25.7.1 The AsyncFunction Constructor

  async function AsyncFunctionInstance() {} // eslint-disable-line no-empty-function
  const AsyncFunction = getConstructorOf(AsyncFunctionInstance);

  // VALIDATION

  const intrinsics = {
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
  };

  return intrinsics;
}
