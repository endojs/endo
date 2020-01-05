const { getOwnPropertyDescriptor, getPrototypeOf } = Object;

const { apply } = Reflect;
const uncurryThis = fn => (thisArg, ...args) => apply(fn, thisArg, args);
const hasOwnProperty = uncurryThis(Object.prototype.hasOwnProperty);

/**
 * getConstructorOf()
 * Helper function to improve readability, similar to getPrototypeOf().
 */
function getConstructorOf(obj) {
  return getPrototypeOf(obj).constructor;
}

/**
 * intrinsicNames
 * The following list contains all intrisics names as defined in the specs, except
 * that the leading an trainling '%' characters have been removed. We want to begin
 * bith the specs so we can better track changes.
 */
const intrinsicNames = [
  // 6.1.7.4 Well-Known Intrinsic Objects
  // Table 8: Well-Known Intrinsic Objects
  'Array',
  'ArrayBuffer',
  'ArrayBufferPrototype',
  'ArrayIteratorPrototype',
  'ArrayPrototype',
  // TODO ArrayProto_*
  // 'ArrayProto_entries',
  // 'ArrayProto_forEach',
  // 'ArrayProto_keys',
  // 'ArrayProto_values',
  // 25.1.4.2 The %AsyncFromSyncIteratorPrototype% Object
  // TODO Beleived to not be directly accessible to ECMAScript code.
  // 'AsyncFromSyncIteratorPrototype',
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
  'decodeURI',
  'decodeURIComponent',
  'encodeURI',
  'encodeURIComponent',
  'Error',
  'ErrorPrototype',
  'eval',
  'EvalError',
  'EvalErrorPrototype',
  'Float32Array',
  'Float32ArrayPrototype',
  'Float64Array',
  'Float64ArrayPrototype',
  // 13.7.5.16.2 The %ForInIteratorPrototype% Object
  // Documneted as "never directly accessible to ECMAScript code."
  // 'ForInIteratorPrototype',
  'Function',
  'FunctionPrototype',
  'Generator',
  'GeneratorFunction',
  'GeneratorPrototype',
  'Int8Array',
  'Int8ArrayPrototype',
  'Int16Array',
  'Int16ArrayPrototype',
  'Int32Array',
  'Int32ArrayPrototype',
  'isFinite',
  'isNaN',
  'IteratorPrototype',
  'JSON',
  // TODO
  // 'JSONParse',
  // 'JSONStringify',
  'Map',
  'MapIteratorPrototype',
  'MapPrototype',
  'Math',
  'Number',
  'NumberPrototype',
  'Object',
  'ObjectPrototype',
  // TODO
  // 'ObjProto_toString',
  // 'ObjProto_valueOf',
  'parseFloat',
  'parseInt',
  'Promise',
  'PromisePrototype',
  // TODO
  // 'PromiseProto_then',
  // 'Promise_all',
  // 'Promise_reject',
  // 'Promise_resolve',
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
  'TypedArray',
  'TypedArrayPrototype',
  'TypeError',
  'TypeErrorPrototype',
  'Uint8Array',
  'Uint8ArrayPrototype',
  'Uint8ClampedArray',
  'Uint8ClampedArrayPrototype',
  'Uint16Array',
  'Uint16ArrayPrototype',
  'Uint32Array',
  'Uint32ArrayPrototype',
  'URIError',
  'URIErrorPrototype',
  'WeakMap',
  'WeakMapPrototype',
  'WeakSet',
  'WeakSetPrototype',

  // B.2.1 Additional Properties of the Global Object
  // Table 87: Additional Well-known Intrinsic Objects
  'escape',
  'unescape',
];

/**
 * validateAnonIntrinsics()
 * Ensure that the rootAnonIntrinsics are consistent with specs. These
 * tests are necesary to ensure that sampling was correctly done.
 */
function validateAnonIntrinsics(intrinsics) {
  const {
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

  if (getPrototypeOf(ThrowTypeError) !== Function.prototype) {
    throw new TypeError(
      'ThrowTypeError.__proto__ should be Function.prototype',
    );
  }

  // 21.1.5.2 The %StringIteratorPrototype% Object

  if (getPrototypeOf(StringIteratorPrototype) !== IteratorPrototype) {
    throw new TypeError(
      'StringIteratorPrototype.__proto__ should be IteratorPrototype',
    );
  }

  // 21.2.7.1 The %RegExpStringIteratorPrototype% Object

  if (getPrototypeOf(RegExpStringIteratorPrototype) !== IteratorPrototype) {
    throw new TypeError(
      'RegExpStringIteratorPrototype.__proto__ should be IteratorPrototype',
    );
  }

  // 22.2.1 The %TypedArray% Intrinsic Object

  if (getPrototypeOf(TypedArray) !== Function.prototype) {
    // http://bespin.cz/~ondras/html/classv8_1_1ArrayBufferView.html
    // has me worried that someone might make such an intermediate
    // object visible.
    throw new Error('TypedArray.__proto__ should be Function.prototype');
  }

  // 23.1.5.2 The %MapIteratorPrototype% Object

  if (getPrototypeOf(MapIteratorPrototype) !== IteratorPrototype) {
    throw new TypeError(
      'MapIteratorPrototype.__proto__ should be IteratorPrototype',
    );
  }

  // 23.2.5.2 The %SetIteratorPrototype% Object

  if (getPrototypeOf(SetIteratorPrototype) !== IteratorPrototype) {
    throw new TypeError(
      'SetIteratorPrototype.__proto__ should be IteratorPrototype',
    );
  }

  // 25.1.2 The %IteratorPrototype% Object

  if (getPrototypeOf(IteratorPrototype) !== Object.prototype) {
    throw new TypeError(
      'IteratorPrototype.__proto__ should be Object.prototype',
    );
  }

  // 25.1.3 The %AsyncIteratorPrototype% Object

  if (getPrototypeOf(AsyncIteratorPrototype) !== Object.prototype) {
    throw new TypeError(
      'AsyncIteratorPrototype.__proto__ should be Object.prototype',
    );
  }

  // 22.1.5.2 The %ArrayIteratorPrototype% Object

  if (getPrototypeOf(ArrayIteratorPrototype) !== IteratorPrototype) {
    throw new TypeError(
      'AsyncIteratorPrototype.__proto__ should be IteratorPrototype',
    );
  }

  // 25.2.2 Properties of the GeneratorFunction Constructor

  if (getPrototypeOf(GeneratorFunction) !== Function) {
    throw new Error('GeneratorFunction.__proto__ should be Function');
  }
  if (GeneratorFunction.name !== 'GeneratorFunction') {
    throw new TypeError('GeneratorFunction.name should be "GeneratorFunction"');
  }

  // 25.2.3 Properties of the GeneratorFunction Prototype Object

  if (getPrototypeOf(Generator) !== Function.prototype) {
    throw new Error('Generator.__proto__ should be Function.prototype');
  }

  // 25.3.1 The AsyncGeneratorFunction Constructor

  if (getPrototypeOf(AsyncGeneratorFunction) !== Function) {
    throw new TypeError('AsyncGeneratorFunction.__proto__ should be Function');
  }
  if (AsyncGeneratorFunction.name !== 'AsyncGeneratorFunction') {
    throw new TypeError(
      'AsyncGeneratorFunction.name should be "AsyncGeneratorFunction"',
    );
  }

  // 25.3.3 Properties of the AsyncGeneratorFunction Prototype Object

  if (getPrototypeOf(AsyncGenerator) !== Function.prototype) {
    throw new Error('AsyncGenerator.__proto__ should be Function.prototype');
  }

  // 25.5.1 Properties of the AsyncGenerator Prototype Object

  if (getPrototypeOf(AsyncGeneratorPrototype) !== AsyncIteratorPrototype) {
    throw new TypeError(
      'AsyncGeneratorPrototype.__proto__ should be AsyncIteratorPrototype',
    );
  }

  // 25.7.1 The AsyncFunction Constructor

  if (getPrototypeOf(AsyncFunction) !== Function) {
    throw new TypeError('AsyncFunction.__proto__ should be Function');
  }
  if (AsyncFunction.name !== 'AsyncFunction') {
    throw new TypeError('AsyncFunction.name should be "AsyncFunction"');
  }
}

/**
 * getRootIntrinsics()
 * Get the intrinsics not otherwise reachable by named own property
 * traversal from the global object.
 */
function getRootIntrinsics() {
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

  validateAnonIntrinsics(intrinsics);

  return intrinsics;
}

/**
 * getNamedIntrinsic()
 * Get the intrinsic from the global object.
 */
function getNamedIntrinsic(root, name) {
  const desc = getOwnPropertyDescriptor(root, name);
  if (!desc) {
    return undefined;
  }

  // Abort if an accessor is found on the object instead of a data property.
  // We should never get into this non standard situation.
  if ('get' in desc || 'set' in desc) {
    throw new TypeError(`unexpected accessor on global property: ${name}`);
  }

  return desc.value;
}

const suffix = 'Prototype';

export default function getIntrinsics() {
  const intrinsics = { __proto__: null };

  // eslint-disable-next-line no-new-func
  const root = Function('return this')(); // TODO replace root with globalThis
  const nonRootIntrinsics = getRootIntrinsics();

  for (const name of intrinsicNames) {
    if (hasOwnProperty(nonRootIntrinsics, name)) {
      //
      // Case 1. Resolve to a sampled intrinsics.

      intrinsics[name] = nonRootIntrinsics[name];
    } else if (name.endsWith(suffix)) {
      //
      // Case 2. Resolve to the prototype of a resolved intrinsics.

      // Assume that 'Prototype' is always the suffix for prototype properties.
      const prefix = name.slice(0, -suffix.length);

      // Assume that root has already been processed, otherwise this throws.
      if (hasOwnProperty(intrinsics, prefix)) {
        const parent = intrinsics[prefix];
        intrinsics[name] =
          parent === undefined ? undefined : getPrototypeOf(parent);
      } else {
        throw new TypeError(`Intrinsic not found ${prefix}`);
      }
    } else {
      //
      // Case 3. Resolved to a global object property.

      // Assume that the intrinsic name matches a global object with the same name.
      intrinsics[name] = getNamedIntrinsic(root, name);
    }
  }

  Object.keys(intrinsics).forEach(name => {
    if (intrinsics[name] === undefined) {
      throw new TypeError(`Malformed intrinsic: ${name}`);
    }
  });

  return intrinsics;
}
