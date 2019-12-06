export default function makeConsole(parentConsole) {
  /* 'parentConsole' is the parent Realm's original 'console' object. We must
     wrap it, exposing a 'console' with a 'console.log' (and perhaps others)
     to the local realm, without allowing access to the original 'console',
     its return values, or its exception objects, any of which could be used
     to break confinement via the unsafe Function constructor. */

  // callAndWrapError is copied from proposal-realms/shim/src/realmFacade.js
  // Like Realm.apply except that it catches anything thrown and rethrows it
  // as an Error from this realm

  const errorConstructors = new Map([
    ['EvalError', EvalError],
    ['RangeError', RangeError],
    ['ReferenceError', ReferenceError],
    ['SyntaxError', SyntaxError],
    ['TypeError', TypeError],
    ['URIError', URIError],
  ]);

  function callAndWrapError(target, ...args) {
    try {
      return target(...args);
    } catch (err) {
      if (Object(err) !== err) {
        // err is a primitive value, which is safe to rethrow
        throw err;
      }
      let eName;
      let eMessage;
      let eStack;
      try {
        // The child environment might seek to use 'err' to reach the
        // parent's intrinsics and corrupt them. `${err.name}` will cause
        // string coercion of 'err.name'. If err.name is an object (probably
        // a String of the parent Realm), the coercion uses
        // err.name.toString(), which is under the control of the parent. If
        // err.name were a primitive (e.g. a number), it would use
        // Number.toString(err.name), using the child's version of Number
        // (which the child could modify to capture its argument for later
        // use), however primitives don't have properties like .prototype so
        // they aren't useful for an attack.
        eName = `${err.name}`;
        eMessage = `${err.message}`;
        eStack = `${err.stack || eMessage}`;
        // eName/eMessage/eStack are now child-realm primitive strings, and
        // safe to expose
      } catch (ignored) {
        // if err.name.toString() throws, keep the (parent realm) Error away
        // from the child
        throw new Error('unknown error');
      }
      const ErrorConstructor = errorConstructors.get(eName) || Error;
      try {
        throw new ErrorConstructor(eMessage);
      } catch (err2) {
        err2.stack = eStack; // replace with the captured inner stack
        throw err2;
      }
    }
  }

  const newConsole = {};
  const passThrough = [
    'log',
    'info',
    'warn',
    'error',
    'group',
    'groupEnd',
    'trace',
    'time',
    'timeLog',
    'timeEnd',
  ];
  // TODO: those are the properties that MDN documents. Node.js has a bunch
  // of additional ones that I didn't include, which might be appropriate.

  passThrough.forEach(name => {
    // TODO: do we reveal the presence/absence of these properties to the
    // child realm, thus exposing nondeterminism (and a hint of what platform
    // you might be on) when it is constructed with {consoleMode: allow} ? Or
    // should we expose the same set all the time, but silently ignore calls
    // to the missing ones, to hide that variation? We might even consider
    // adding console.* to the child realm all the time, even without
    // consoleMode:allow, but ignore the calls unless the mode is enabled.
    if (name in parentConsole) {
      const orig = parentConsole[name];
      // TODO: in a stack trace, this appears as
      // "Object.newConsole.(anonymous function) [as trace]"
      // can we make that "newConsole.trace" ?
      newConsole[name] = function newerConsole(...args) {
        callAndWrapError(orig, ...args);
      };
    }
  });

  return newConsole;
}
