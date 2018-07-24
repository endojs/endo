// Copyright (C) 2018 Agoric
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

export function createSESWithRealmConstructor(creatorStrings, Realm) {
  function makeSESRootRealm(options) {
    options = Object(options); // Todo: sanitize
    const r = Realm.makeRootRealm();
    const b = r.evaluate(creatorStrings);
    b.createSESInThisRealm(r.global, creatorStrings, r);
    //b.removeProperties(r.global);
    b.tamePrimordials(r.global, options);
    b.deepFreezePrimordials(r.global);
    return r;
  }
  const SES = {
    makeSESRootRealm,
  };

  return SES;
}

export function createSESInThisRealm(global, creatorStrings, parentRealm) {
  global.SES = createSESWithRealmConstructor(creatorStrings, Realm);
  // todo: wrap exceptions, effectively undoing the wrapping that
  // Realm.evaluate does

  const errorConstructors = new Map([
    ['EvalError', EvalError],
    ['RangeError', RangeError],
    ['ReferenceError', ReferenceError],
    ['SyntaxError', SyntaxError],
    ['TypeError', TypeError],
    ['URIError', URIError]
  ]);

  // callAndWrapError is copied from the Realm shim. Our SES.confine (from
  // inside the realm) delegates to Realm.evaluate (from outside the realm),
  // but we need the exceptions to come from our own realm, so we use this to
  // reverse the shim's own callAndWrapError. TODO: look for a reasonable way
  // to avoid the double-wrapping, maybe by changing the shim/Realms-spec to
  // provide the safeEvaluator as a Realm.evaluate method (inside a realm).
  // That would make this trivial: global.SES = Realm.evaluate (modulo
  // potential 'this' issues)

  // the comments here were written from the POV of a parent defending itself
  // against a malicious child realm. In this case, we are the child.

  function callAndWrapError(target, ...args) {
    try {
      return target(...args);
    } catch (err) {
      if (Object(err) !== err) {
        // err is a primitive value, which is safe to rethrow
        throw err;
      }
      let eName, eMessage, eStack;
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
        eStack = `${err.stack}`;
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

  // We must not allow other child code to access that object. SES.confine
  // closes over the parent's Realm object so it shouldn't be accessible from
  // the outside.

  global.SES.confine = (code, endowments) => callAndWrapError(
    () => parentRealm.evaluate(code, endowments));
}
