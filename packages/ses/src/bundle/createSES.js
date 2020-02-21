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

import makeHardener from '@agoric/make-hardener';
import tameDate from './tame-date';
import tameMath from './tame-math';
import tameIntl from './tame-intl';
import tameError from './tame-error';
import tameRegExp from './tame-regexp';
import removeProperties from './removeProperties';
import getAnonIntrinsics from './anonIntrinsics';
import getNamedIntrinsics from './namedIntrinsics';
import getAllPrimordials from './getAllPrimordials';
import getAllIntrinsics from './getAllIntrinsics';
import whitelist from './whitelist';
import makeConsole from './make-console';
import makeMakeRequire from './make-require';
import dataPropertiesToRepair from './dataPropertiesToRepair';
import repairDataProperties from './repairDataProperties';

const FORWARDED_REALMS_OPTIONS = ['transforms', 'configurableGlobals'];

export function createSESWithRealmConstructor(creatorStrings, Realm) {
  function makeSESRootRealm(options) {
    // eslint-disable-next-line no-param-reassign
    options = Object(options); // Todo: sanitize
    const shims = [];

    const {
      dataPropertiesToRepair: optDataPropertiesToRepair,
      shims: optionalShims,
      sloppyGlobals,
      whitelist: optWhitelist,
      ...optionsRest
    } = options;

    const wl = JSON.parse(JSON.stringify(optWhitelist || whitelist));
    const repairPlan =
      optDataPropertiesToRepair !== undefined
        ? JSON.parse(JSON.stringify(optDataPropertiesToRepair))
        : dataPropertiesToRepair;

    // Forward the designated Realms options.
    const realmsOptions = {};
    FORWARDED_REALMS_OPTIONS.forEach(key => {
      if (key in optionsRest) {
        realmsOptions[key] = optionsRest[key];
      }
    });

    if (sloppyGlobals) {
      throw TypeError(`\
sloppyGlobals cannot be specified for makeSESRootRealm!
You probably want a Compartment instead, like:
  const c = s.global.Realm.makeCompartment({ sloppyGlobals: true })`);
    }

    // "allow" enables real Date.now(), anything else gets NaN
    // (it'd be nice to allow a fixed numeric value, but too hard to
    // implement right now)
    if (options.dateNowMode !== 'allow') {
      shims.push(`(${tameDate})();`);
    }

    if (options.mathRandomMode !== 'allow') {
      shims.push(`(${tameMath})();`);
    }

    // Intl is disabled entirely for now, deleted by removeProperties. If we
    // want to bring it back (under the control of this option), we'll need
    // to add it to the whitelist too, as well as taming it properly.
    if (options.intlMode !== 'allow') {
      // this shim also disables Object.prototype.toLocaleString
      shims.push(`(${tameIntl})();`);
    } else {
      /*
      wl.namedIntrinsics.Intl = {
        Collator: true,
        DateTimeFormat: true,
        NumberFormat: true,
        PluralRules: true,
        getCanonicalLocales: true
      }
      */
    }

    if (options.errorStackMode !== 'allow') {
      shims.push(`(${tameError})();`);
    } else {
      // if removeProperties cleans these things from Error, v8 won't provide
      // stack traces or even toString on exceptions, and then Node.js prints
      // uncaught exceptions as "undefined" instead of a type/message/stack.
      // So if we're allowing stack traces, make sure the whitelist is
      // augmented to include them.
      wl.namedIntrinsics.Error.captureStackTrace = true;
      wl.namedIntrinsics.Error.stackTraceLimit = true;
      wl.namedIntrinsics.Error.prepareStackTrace = true;
    }

    if (options.regexpMode !== 'allow') {
      shims.push(`(${tameRegExp})();`);
    }

    // The getAnonIntrinsics function might be renamed by e.g. rollup. The
    // removeProperties() function references it by name, so we need to force
    // it to have a specific name.
    const removeProp = `const getAnonIntrinsics = (${getAnonIntrinsics});
               (${removeProperties})(this, ${JSON.stringify(wl)})`;
    shims.push(removeProp);

    // Add options.shims.
    if (optionalShims) {
      shims.push(...optionalShims);
    }

    const r = Realm.makeRootRealm({ ...realmsOptions, shims });

    // Build a harden() with an empty fringe. It will be populated later when
    // we call harden(allIntrinsics).
    const makeHardenerSrc = `(${makeHardener})`;
    const harden = r.evaluate(makeHardenerSrc)();

    const b = r.evaluate(creatorStrings);
    b.createSESInThisRealm(r.global, creatorStrings, r);

    // Allow harden to be accessible via the SES global.
    r.global.SES.harden = harden;

    if (options.consoleMode === 'allow') {
      const s = `(${makeConsole})`;
      r.global.console = r.evaluate(s)(console);
    }

    // Extract the intrinsics from the global.
    const anonIntrinsics = r.evaluate(`(${getAnonIntrinsics})`)(r.global);
    const namedIntrinsics = r.evaluate(`(${getNamedIntrinsics})`)(
      r.global,
      whitelist,
    );

    // Gather the intrinsics only.
    const allIntrinsics = r.evaluate(`(${getAllIntrinsics})`)(
      namedIntrinsics,
      anonIntrinsics,
    );

    // Gather the primordials and the globals.
    const allPrimordials = r.evaluate(`(${getAllPrimordials})`)(
      r.global,
      anonIntrinsics,
    );

    // Repair the override mistake on the intrinsics only.
    r.evaluate(`(${repairDataProperties})`)(allIntrinsics, repairPlan);

    // Finally freeze all the primordials, and the global object. This must
    // be the last thing we do that modifies the Realm's globals.
    harden(allPrimordials);

    // build the makeRequire helper, glue it to the new Realm
    r.makeRequire = harden(r.evaluate(`(${makeMakeRequire})`)(r, harden));
    return r;
  }
  const SES = {
    makeSESRootRealm,
  };

  return SES;
}

export function createSESInThisRealm(global, creatorStrings, parentRealm) {
  // eslint-disable-next-line no-param-reassign,no-undef
  global.SES = createSESWithRealmConstructor(creatorStrings, Realm);
  // todo: wrap exceptions, effectively undoing the wrapping that
  // Realm.evaluate does

  const errorConstructors = new Map([
    ['EvalError', EvalError],
    ['RangeError', RangeError],
    ['ReferenceError', ReferenceError],
    ['SyntaxError', SyntaxError],
    ['TypeError', TypeError],
    ['URIError', URIError],
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

  // We must not allow other child code to access that object. SES.confine
  // closes over the parent's Realm object so it shouldn't be accessible from
  // the outside.

  // eslint-disable-next-line no-param-reassign
  global.SES.confine = (code, endowments) =>
    callAndWrapError(() => parentRealm.evaluate(code, endowments));
  // eslint-disable-next-line no-param-reassign
  global.SES.confineExpr = (code, endowments) =>
    callAndWrapError(() => parentRealm.evaluate(`(${code})`, endowments));
}
