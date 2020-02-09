// Adapted from SES/Caja
// Copyright (C) 2011 Google Inc.
// https://github.com/google/caja/blob/master/src/com/google/caja/ses/startSES.js
// https://github.com/google/caja/blob/master/src/com/google/caja/ses/repairES5.js

/**
 * tameFunctionConstructors()
 * This block replaces the original Function constructor, and the original
 * %GeneratorFunction% %AsyncFunction% and %AsyncGeneratorFunction%, with
 * safe replacements that throw if invoked.
 */

export default function tameFunctionConstructors() {
  try {
    // Verify that the method is not callable.
    (0, Function.prototype.constructor)('return 1');
  } catch (ignore) {
    // Throws, no need to patch.
    return;
  }

  const { defineProperties, getPrototypeOf, setPrototypeOf } = Object;

  /**
   * The process to repair constructors:
   * 1. Create an instance of the function by evaluating syntax
   * 2. Obtain the prototype from the instance
   * 3. Create a substitute tamed constructor
   * 4. Replace the original constructor with the tamed constructor
   * 5. Replace tamed constructor prototype property with the original one
   * 6. Replace its [[Prototype]] slot with the tamed constructor of Function
   */
  function repairFunction(name, declaration) {
    let FunctionInstance;
    try {
      // eslint-disable-next-line no-eval
      FunctionInstance = (0, eval)(declaration);
    } catch (e) {
      if (e instanceof SyntaxError) {
        // Prevent failure on platforms where async and/or generators
        // are not supported.
        return;
      }
      // Re-throw
      throw e;
    }
    const FunctionPrototype = getPrototypeOf(FunctionInstance);

    // Prevents the evaluation of source when calling constructor on the
    // prototype of functions.
    // eslint-disable-next-line func-names
    const constructor = function() {
      throw new TypeError('Not available');
    };
    defineProperties(constructor, {
      name: {
        value: name,
        writable: false,
        enumerable: false,
        configurable: true,
      },
      toString: {
        value: () => `function ${name}() { [native code] }`,
        writable: false,
        enumerable: false,
        configurable: true,
      },
    });

    defineProperties(FunctionPrototype, {
      constructor: { value: constructor },
    });

    // This line sets the tamed constructor's prototype data property to
    // the original one.
    defineProperties(constructor, {
      prototype: { value: FunctionPrototype },
    });

    // This line ensures that all functions meet "instanceof Function" in
    // a give realm.
    if (constructor !== Function.prototype.constructor) {
      setPrototypeOf(constructor, Function.prototype.constructor);
    }
  }

  // Here, the order of operation is important: Function needs to be repaired
  // first since the other repaired constructors need to inherit from the tamed
  // Function function constructor.

  repairFunction('Function', '(function(){})');
  repairFunction('GeneratorFunction', '(function*(){})');
  repairFunction('AsyncFunction', '(async function(){})');
  repairFunction('AsyncGeneratorFunction', '(async function*(){})');
}
