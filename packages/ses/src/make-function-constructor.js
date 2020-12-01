import {
  arrayJoin,
  arrayPop,
  defineProperties,
  getPrototypeOf,
} from './commons.js';
import { performEval } from './evaluate.js';
import { assert } from './error/assert.js';

// The original unsafe untamed Function constructor, which must not escape.
// Sample at module initialization time, which is before lockdown can
// repair it.  Use it only to build powerless abstractions.
const FERAL_FUNCTION = Function;

/*
 * makeFunctionConstructor()
 * A safe version of the native Function which relies on
 * the safety of performEval for confinement.
 */
export function makeFunctionConstructor(globaObject, options = {}) {
  // Define an unused parameter to ensure Function.length === 1
  const newFunction = function Function(_body) {
    // Sanitize all parameters at the entry point.
    // eslint-disable-next-line prefer-rest-params
    const bodyText = `${arrayPop(arguments) || ''}`;
    // eslint-disable-next-line prefer-rest-params
    const parameters = `${arrayJoin(arguments, ',')}`;

    // Are parameters and bodyText valid code, or is someone
    // attempting an injection attack? This will throw a SyntaxError if:
    // - parameters doesn't parse as parameters
    // - bodyText doesn't parse as a function body
    // - either contain a call to super() or references a super property.
    // eslint-disable-next-line no-new
    new FERAL_FUNCTION(parameters, bodyText);

    // Safe to be combined. Defeat potential trailing comments.
    // TODO: since we create an anonymous function, the 'this' value
    // isn't bound to the global object as per specs, but set as undefined.
    const src = `(function anonymous(${parameters}\n) {\n${bodyText}\n})`;
    return performEval(src, globaObject, {}, options);
  };

  defineProperties(newFunction, {
    // Ensure that any function created in any evaluator in a realm is an
    // instance of Function in any evaluator of the same realm.
    prototype: {
      value: Function.prototype,
      writable: false,
      enumerable: false,
      configurable: false,
    },
  });

  // Assert identity of Function.__proto__ accross all compartments
  assert(
    getPrototypeOf(Function) === Function.prototype,
    'Function prototype is the same accross compartments',
  );
  assert(
    getPrototypeOf(newFunction) === Function.prototype,
    'Function constructor prototype is the same accross compartments',
  );

  return newFunction;
}
