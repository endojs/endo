import { assert } from './assertions';
import {
  arrayJoin,
  arrayPop,
  defineProperties,
  getConstructorOf,
} from './commons';
import { performEval } from './evaluate';

/**
 * createFunctionConstructor()
 * A safe version of the native Function which relies on
 * the safety of performEvaluate for confinement.
 */
export function createFunctionConstructor(realmRec, globaObject, options = {}) {
  // Define an unused parameter to ensure Function.length === 1
  // eslint-disable-next-line no-unused-vars
  const newFunction = function Function(body) {
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
    // eslint-disable-next-line no-new, new-cap
    new realmRec.intrinsics.Function(parameters, bodyText);

    // Safe to be combined. Defeat potential trailing comments.
    // TODO: since we create an anonymous function, the 'this' value
    // isn't bound to the global object as per specs, but set as undefined.
    const src = `(function anonymous(${parameters}\n){\n${bodyText}\n})`;
    return performEval(realmRec, src, globaObject, {}, options);
  };

  defineProperties(newFunction, {
    // Ensure that any function created in any evaluator in a realm is an
    // instance of Function in any evaluator of the same realm.
    prototype: { value: realmRec.intrinsics.Function.prototype },

    // Provide a custom output without overwriting
    // Function.prototype.toString which is called by some third-party
    // libraries.
    toString: {
      value: () => 'function Function() { [shim code] }',
      writable: false,
      enumerable: false,
      configurable: true,
    },
  });

  assert(getConstructorOf(newFunction) !== Function);
  assert(getConstructorOf(newFunction) !== realmRec.intrinsics.Function);

  return newFunction;
}
