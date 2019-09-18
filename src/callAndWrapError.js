import { cleanupSource } from './utilities';

function buildCallAndWrapError() {
  // This Object and Reflect are brand new, from a new unsafeRec, so no user
  // code has been run or had a chance to manipulate them. Don't ever run this
  // function *after* user code has had a chance to pollute its environment,
  // or it could be used to gain access to BaseRealm and primal-realm Error
  // objects.
  const { getPrototypeOf } = Object;
  const { apply } = Reflect;
  const uncurryThis = fn => (thisArg, ...args) => apply(fn, thisArg, args);
  const mapGet = uncurryThis(Map.prototype.get);
  const setHas = uncurryThis(Set.prototype.has);

  const errorNameToErrorConstructor = new Map([
    ['EvalError', EvalError],
    ['RangeError', RangeError],
    ['ReferenceError', ReferenceError],
    ['SyntaxError', SyntaxError],
    ['TypeError', TypeError],
    ['URIError', URIError]
  ]);
  const errorConstructors = new Set([
    EvalError.prototype,
    RangeError.prototype,
    ReferenceError.prototype,
    SyntaxError.prototype,
    TypeError.prototype,
    URIError.prototype,
    Error.prototype
  ]);

  function callAndWrapError(target, ...args) {
    try {
      return target(...args);
    } catch (err) {
      // 1. Thrown primitives
      if (Object(err) !== err) {
        // err is a primitive value, which is safe to rethrow
        throw err;
      }

      // 2. Current realm errors
      if (setHas(errorConstructors, getPrototypeOf(err))) {
        // err is a from the current realm, which is safe to rethrow.
        // Object instances (normally) only contain intrinsics from the
        // same realm. An error containing intrinsics from different
        // realms would have to be manually constucted, which imply that
        // such intrinsics were available, and confinement was already lost.
        throw err;
      }

      // 3. Other realm errors
      let eName, eMessage, eStack;
      try {
        // The other environment might seek to use 'err' to reach the
        // parent's intrinsics and corrupt them. In addition, exceptions
        // raised in the primal realm need to be converted to the current
        // realm.

        // `${err.name}` will cause string coercion of 'err.name'.
        // If err.name is an object (probably a String of another Realm),
        // the coercion uses err.name.toString(), which is under the control
        // of the other realm. If err.name were a primitive (e.g. a number),
        // it would use Number.toString(err.name), using the child's version
        // of Number (which the child could modify to capture its argument for
        // later use), however primitives don't have properties like .prototype
        // so they aren't useful for an attack.
        eName = `${err.name}`;
        eMessage = `${err.message}`;
        eStack = `${err.stack || eMessage}`;
        // eName/eMessage/eStack are now realm-independent primitive strings, and
        // safe to expose.
      } catch (ignored) {
        // if err.name.toString() throws, keep the (parent realm) Error away.
        throw new Error('unknown error');
      }
      const ErrorConstructor =
        mapGet(errorNameToErrorConstructor, eName) || Error;
      try {
        throw new ErrorConstructor(eMessage);
      } catch (err2) {
        err2.stack = eStack; // replace with the captured inner stack
        throw err2;
      }
    }
  }

  return callAndWrapError;
}

const buildCallAndWrapErrorString = cleanupSource(
  `'use strict'; (${buildCallAndWrapError})`
);
export function createCallAndWrapError(unsafeEval) {
  return unsafeEval(buildCallAndWrapErrorString)();
}
