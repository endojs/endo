import {
  arrayJoin,
  arrayPop,
  defineProperties,
  getConstructorOf,
  regexpTest,
  stringIncludes
} from './commons';
import { assert } from './utilities';

/**
 * createSafeFunction()
 * A safe version of the native Function which relies on
 * the safety of safeEvaluator for confinement.
 */
export function createSafeFunction(unsafeRec, safeEvaluator) {
  const { unsafeFunction } = unsafeRec;
  function safeFunction(...params) {
    // Sanitize all parameters at the entry point. We replace the
    // original arguments to ensure those are not accidently used.
    const functionBody = `${arrayPop(params) || ''}`;
    let functionParams = `${arrayJoin(params, ',')}`;
    params.length = 0; // clear the array

    if (!regexpTest(/^[\w\s,]*$/, functionParams)) {
      throw new SyntaxError(
        'shim limitation: Function arg must be simple ASCII identifiers, possibly separated by commas: no default values, pattern matches, or non-ASCII parameter names'
      );
      // this protects against Matt Austin's clever attack:
      // Function("arg=`", "/*body`){});({x: this/**/")
      // which would turn into
      //     (function(arg=`
      //     /*``*/){
      //      /*body`){});({x: this/**/
      //     })
      // which parses as a default argument of `\n/*``*/){\n/*body` , which
      // is a pair of template literals back-to-back (so the first one
      // nominally evaluates to the parser to use on the second one), which
      // can't actually execute (because the first literal evals to a string,
      // which can't be a parser function), but that doesn't matter because
      // the function is bypassed entirely. When that gets evaluated, it
      // defines (but does not invoke) a function, then evaluates a simple
      // {x: this} expression, giving access to the safe global.
    }

    // Is this a real functionBody, or is someone attempting an injection
    // attack? This will throw a SyntaxError if the string is not actually a
    // function body. We coerce the body into a real string above to prevent
    // someone from passing an object with a toString() that returns a safe
    // string the first time, but an evil string the second time.
    // eslint-disable-next-line no-new, new-cap
    new unsafeFunction(functionBody);

    if (stringIncludes(functionParams, ')')) {
      // If the formal parameters string include ) - an illegal
      // character - it may make the combined function expression
      // compile. We avoid this problem by checking for this early on.

      // note: v8 throws just like this does, but chrome accepts
      // e.g. 'a = new Date()'
      throw new SyntaxError(
        'shim limitation: Function arg string contains parenthesis'
      );
      // todo: shim integrity threat if they change SyntaxError
    }

    if (functionParams.length > 0) {
      // If the formal parameters include an unbalanced block comment, the
      // function must be rejected. Since JavaScript does not allow nested
      // comments we can include a trailing block comment to catch this.
      functionParams += '\n/*``*/';
    }

    const src = `(function(${functionParams}){\n${functionBody}\n})`;

    return safeEvaluator(src);
  }

  defineProperties(safeFunction, {
    // Ensure that any function created in any evaluator in a root realm is an
    // instance of Function in any evaluator of the same root ralm.
    prototype: { value: unsafeFunction.prototype },

    // Provide a custom output without overwriting
    // Function.prototype.toString which is called by some third-party
    // libraries.
    toString: {
      value: () => 'function Function() { [shim code] }',
      writable: false,
      enumerable: false,
      configurable: true
    }
  });

  assert(getConstructorOf(safeFunction) !== Function, 'hide Function');
  assert(
    getConstructorOf(safeFunction) !== unsafeFunction,
    'hide unsafeFunction'
  );

  return safeFunction;
}
