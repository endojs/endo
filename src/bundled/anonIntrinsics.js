// Copyright (C) 2011 Google Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// TODO(erights): We should test for
// We now have a reason to omit Proxy from the whitelist.
// The makeBrandTester in repairES5 uses Allen's trick at
// https://esdiscuss.org/topic/tostringtag-spoofing-for-null-and-undefined#content-59
// , but testing reveals that, on FF 35.0.1, a proxy on an exotic
// object X will pass this brand test when X will. This is fixed as of
// FF Nightly 38.0a1.



/**
 * <p>Qualifying platforms generally include all JavaScript platforms
 * shown on <a href="http://kangax.github.com/es5-compat-table/"
 * >ECMAScript 5 compatibility table</a> that implement {@code
 * Object.getOwnPropertyNames}. At the time of this writing,
 * qualifying browsers already include the latest released versions of
 * Internet Explorer (9), Firefox (4), Chrome (11), and Safari
 * (5.0.5), their corresponding standalone (e.g., server-side) JavaScript
 * engines, Rhino 1.73, and BESEN.
 *
 * <p>On such not-quite-ES5 platforms, some elements of these
 * emulations may lose SES safety, as enumerated in the comment on
 * each problem record in the {@code baseProblems} and {@code
 * supportedProblems} array below. The platform must at least provide
 * {@code Object.getOwnPropertyNames}, because it cannot reasonably be
 * emulated.
 *
 * <p>This file is useful by itself, as it has no dependencies on the
 * rest of SES. It creates no new global bindings, but merely repairs
 * standard globals or standard elements reachable from standard
 * globals. If the future-standard {@code WeakMap} global is present,
 * as it is currently on FF7.0a1, then it will repair it in place. The
 * one non-standard element that this file uses is {@code console} if
 * present, in order to report the repairs it found necessary, in
 * which case we use its {@code log, info, warn}, and {@code error}
 * methods. If {@code console.log} is absent, then this file performs
 * its repairs silently.
 *
 * <p>Generally, this file should be run as the first script in a
 * JavaScript context (i.e. a browser frame), as it relies on other
 * primordial objects and methods not yet being perturbed.
 *
 * <p>TODO(erights): This file tries to protect itself from some
 * post-initialization perturbation by stashing some of the
 * primordials it needs for later use, but this attempt is currently
 * incomplete. We need to revisit this when we support Confined-ES5,
 * as a variant of SES in which the primordials are not frozen. See
 * previous failed attempt at <a
 * href="https://codereview.appspot.com/5278046/" >Speeds up
 * WeakMap. Preparing to support unfrozen primordials.</a>. From
 * analysis of this failed attempt, it seems that the only practical
 * way to support CES is by use of two frames, where most of initSES
 * runs in a SES frame, and so can avoid worrying about most of these
 * perturbations.
 */
(function repairES5Module(global) {
  "use strict";

  var logger = ses.logger;
  var EarlyStringMap = ses._EarlyStringMap;

  var severities = ses.severities;
  var statuses = ses.statuses;

  /**
   * As we start to repair, this will track the worst post-repair
   * severity seen so far.
   *
   * TODO(kpreid): Revisit this; it's a shim for the old "ses.maxSeverity"
   * which is no longer a global property since it's now internal state of
   * the repairer.
   */
   ses.getMaxSeverity = function getMaxSeverity() {
     return ses._repairer.getCurrentSeverity();
   };

  /**
   * Are we in a condition to safely operate as SES?
   *
   * TODO(kpreid): This should subsume the 'dirty' flag from startSES
   * by making that into a "problem".
   */
  ses.ok = function ok(maxSeverity) {
    return ses._repairer.okToUse(maxSeverity);
  };

  /**
   * Are we in a condition to continue initializing SES (as opposed to
   * aborting)?
   *
   * Does not take a max severity argument because the severity during loading
   * is pre-chosen by maxAcceptableSeverity.
   */
  ses.okToLoad = function okToLoad() {
    if (arguments.length !== 0) {
      // catch a plausible mistake
      throw new Error('okToLoad takes no arguments');
    }
    return ses._repairer.okToLoad();
  };

  /**
   * Update the max based on the provided severity.
   *
   * <p>If the provided severity exceeds the max so far, update the
   * max to match.
   */
  ses.updateMaxSeverity = function updateMaxSeverity(severity) {
    // TODO(kpreid): Replace uses of this with new repair framework
    return ses._repairer.updateMaxSeverity(severity);
  };

  //////// Prepare for "caller" and "argument" testing and repair /////////

  /**
   * Needs to work on ES3, since repairES5.js may be run on an ES3
   * platform.
   */
  function strictForEachFn(list, callback) {
    for (var i = 0, len = list.length; i < len; i++) {
      callback(list[i], i);
    }
  }

  /**
   * A known strict-mode function for tests to use.
   */
  function strictFnSpecimen() {}

  /**
   * Sample map early, to obtain a representative built-in for testing.
   *
   * <p>There is no reliable test for whether a function is a
   * built-in, and it is possible some of the tests below might
   * replace the built-in Array.prototype.map, though currently none
   * do. Since we <i>assume</i> (but with no reliable way to check)
   * that repairES5.js runs in its JavaScript context before anything
   * which might have replaced map, we sample it now. The map method
   * is a particularly nice one to sample, since it can easily be used
   * to test what the "caller" and "arguments" properties on a
   * in-progress built-in method reveals.
   */
  var builtInMapMethod = Array.prototype.map;

  var builtInForEach = Array.prototype.forEach;

  /**
   * At https://bugs.ecmascript.org/show_bug.cgi?id=3113#c24 Jason
   * Orendorff states the best draft for a simpler safe spec for the
   * .caller and .argument properties on functions, that may or may
   * not make it into ES6, but is on a track to standardization
   * regardless. In Firefox 34 and
   * https://bugzilla.mozilla.org/show_bug.cgi?id=969478 apparently
   * this was implemented, or a reasonable approximation that we need
   * to determine can be made SES-safe. Since this is a very different
   * situation that the ES5 spec for these, we test which regime we
   * seem to be in up front, so we can switch other logic based on this.
   *
   * If we seem to be in the new regime, then we try to delete the
   * poison properties for simple safety, rather than trying to find
   * subtle corner cases by which they might lose safety. If any of
   * this fails, then we proceed under the assumption we're in the old
   * regime.
   *
   * If noFuncPoison, then we're in the new regime made simply safe by
   * these deletions, and we do not treat the names 'caller' and
   * 'arguments' on functions as special.
   */
  var noFuncPoison =
      Function.prototype.hasOwnProperty('caller') &&
      Function.prototype.hasOwnProperty('arguments') &&
      !strictFnSpecimen.hasOwnProperty('caller') &&
      !strictFnSpecimen.hasOwnProperty('arguments') &&
      !builtInMapMethod.hasOwnProperty('caller') &&
      !builtInMapMethod.hasOwnProperty('arguments') &&
      delete Function.prototype.caller &&
      delete Function.prototype.arguments &&
      !Function.prototype.hasOwnProperty('caller') &&
      !Function.prototype.hasOwnProperty('arguments');
  ses.noFuncPoison = noFuncPoison;


  /**
   * http://wiki.ecmascript.org/doku.php?id=harmony:egal
   */
  var is = ses.is = Object.is || function(x, y) {
    if (x === y) {
      // 0 === -0, but they are not identical
      return x !== 0 || 1 / x === 1 / y;
    }

    // NaN !== NaN, but they are identical.
    // NaNs are the only non-reflexive value, i.e., if x !== x,
    // then x is a NaN.
    // isNaN is broken: it converts its argument to number, so
    // isNaN("foo") => true
    return x !== x && y !== y;
  };


  /**
   * By the time this module exits, either this is repaired to be a
   * function that is adequate to make the "caller" property of a
   * strict or built-in function harmess, or this module has reported
   * a failure to repair.
   *
   * <p>Start off with the optimistic assumption that nothing is
   * needed to make the "caller" property of a strict or built-in
   * function harmless. We are not concerned with the "caller"
   * property of non-strict functions. It is not the responsibility of
   * this module to actually make these "caller" properties
   * harmless. Rather, this module only provides this function so
   * clients such as startSES.js can use it to do so on the functions
   * they whitelist.
   *
   * <p>If the "caller" property of strict functions are not already
   * harmless, then this platform cannot be repaired to be
   * SES-safe. The only reason why {@code makeCallerHarmless} must
   * work on strict functions in addition to built-in is that some of
   * the other repairs below will replace some of the built-ins with
   * strict functions, so startSES.js will apply {@code
   * makeCallerHarmless} blindly to both strict and built-in
   * functions. {@code makeCallerHarmless} simply need not to complete
   * without breaking anything when given a strict function argument.
   */
  ses.makeCallerHarmless = function assumeCallerHarmless(func, path) {
    return 'Apparently fine';
  };

  /**
   * By the time this module exits, either this is repaired to be a
   * function that is adequate to make the "arguments" property of a
   * strict or built-in function harmess, or this module has reported
   * a failure to repair.
   *
   * Exactly analogous to {@code makeCallerHarmless}, but for
   * "arguments" rather than "caller".
   */
  ses.makeArgumentsHarmless = function assumeArgumentsHarmless(func, path) {
    return 'Apparently fine';
  };

  var simpleTamperProofOk = false;

  /**
   * "makeTamperProof()" returns a "tamperProof(obj, opt_pushNext)"
   * function that acts like "Object.freeze(obj)", except that, if obj
   * is a <i>prototypical</i> object (defined below), it ensures that
   * the effect of freezing properties of obj does not suppress the
   * ability to override these properties on derived objects by simple
   * assignment.
   *
   * <p>If opt_pushNext is provided, then it is called for each value
   * obtained from an own property by reflective property access, so
   * that tamperProof's caller can arrange to visit each of these
   * values after tamperProof returns if it wishes to recur.
   *
   * <p>Because of lack of sufficient foresight at the time, ES5
   * unfortunately specified that a simple assignment to a
   * non-existent property must fail if it would override a
   * non-writable data property of the same name. (In retrospect, this
   * was a mistake, but it is now too late and we must live with the
   * consequences.) As a result, simply freezing an object to make it
   * tamper proof has the unfortunate side effect of breaking
   * previously correct code that is considered to have followed JS
   * best practices, if this previous code used assignment to
   * override.
   *
   * <p>To work around this mistake, tamperProof(obj) detects if obj
   * is <i>prototypical</i>, i.e., is an object whose own
   * "constructor" is a function whose "prototype" is this obj. For example,
   * Object.prototype and Function.prototype are prototypical.  If so,
   * then when tamper proofing it, prior to freezing, replace all its
   * configurable own data properties with accessor properties which
   * simulate what we should have specified -- that assignments to
   * derived objects succeed if otherwise possible. In this case,
   * opt_pushNext, if provided, is called on the value that this data
   * property had <i>and</i> on the accessors which replaced it.
   *
   * <p>Some platforms (Chrome and Safari as of this writing)
   * implement the assignment semantics ES5 should have specified
   * rather than what it did specify.
   * "test_ASSIGN_CAN_OVERRIDE_FROZEN()" below tests whether we are on
   * such a platform. If so, "repair_ASSIGN_CAN_OVERRIDE_FROZEN()"
   * sets simpleTamperProofOk, which informs makeTamperProof that the
   * complex workaround here is not needed on those platforms. If
   * opt_pushNext is provided, it must still use reflection to obtain
   * those values.
   *
   * <p>"makeTamperProof" should only be called after the trusted
   * initialization has done all the monkey patching that it is going
   * to do on the Object.* methods, but before any untrusted code runs
   * in this context.
   */
  function makeTamperProof() {

    // Sample these after all trusted monkey patching initialization
    // but before any untrusted code runs in this frame.
    var gopd = Object.getOwnPropertyDescriptor;
    var gopn = Object.getOwnPropertyNames;
    var freeze = Object.freeze;
    var isFrozen = Object.isFrozen;
    var defProp = Object.defineProperty;
    var call = Function.prototype.call;

    function forEachNonPoisonOwn(obj, callback) {
      var list = gopn(obj);
      var len = list.length;
      var i, j, name;  // crockford rule
      if (typeof obj === 'function') {
        for (i = 0, j = 0; i < len; i++) {
          name = list[i];
          if (noFuncPoison || (name !== 'caller' && name !== 'arguments')) {
            callback(name, j);
            j++;
          }
        }
      } else {
        strictForEachFn(list, callback);
      }
    }

    function simpleTamperProof(obj, opt_pushNext) {
      if (obj !== Object(obj)) { return obj; }
      if (opt_pushNext) {
        forEachNonPoisonOwn(obj, function(name) {
          var desc = gopd(obj, name);
          if ('value' in desc) {
            opt_pushNext(desc.value);
          } else {
            opt_pushNext(desc.get);
            opt_pushNext(desc.set);
          }
        });
      }
      return freeze(obj);
    }

    function tamperProof(obj, opt_pushNext) {
      if (obj !== Object(obj)) { return obj; }
      var func;
      if ((typeof obj === 'object' || obj === Function.prototype) &&
          !!gopd(obj, 'constructor') &&
          typeof (func = obj.constructor) === 'function' &&
          func.prototype === obj &&
          !isFrozen(obj)) {
        var pushNext = opt_pushNext || function(v) {};
        forEachNonPoisonOwn(obj, function(name) {
          var value;
          function getter() {
            return value;
          }

          function setter(newValue) {
            if (obj === this) {
              throw new TypeError('Cannot set virtually frozen property: ' +
                                  name);
            }
            if (!!gopd(this, name)) {
              this[name] = newValue;
            }
            // TODO(erights): Do all the inherited property checks
            defProp(this, name, {
              value: newValue,
              writable: true,
              enumerable: true,
              configurable: true
            });
          }
          var desc = gopd(obj, name);
          if ('value' in desc) {
            value = desc.value;
            // On some engines, and perhaps to become standard in ES6,
            // __proto__ already behaves as an accessor but is made to
            // appear to be a data property, so we should not try to
            // reconfigure it into another accessor.
            if (desc.configurable && name !== '__proto__') {
              getter.prototype = null;
              setter.prototype = null;
              defProp(obj, name, {
                get: getter,
                set: setter,
                // We should be able to omit the enumerable line, since it
                // should default to its existing setting.
                enumerable: desc.enumerable,
                configurable: false
              });
              pushNext(getter);
              pushNext(setter);
            }
            pushNext(value);
          } else {
            pushNext(desc.get);
            pushNext(desc.set);
          }
        });
        return freeze(obj);
      } else {
        return simpleTamperProof(obj, opt_pushNext);
      }
    }
    return simpleTamperProofOk ? simpleTamperProof : tamperProof;
  };


  var needToTamperProof = [];
  /**
   * Various repairs may expose non-standard objects that are not
   * reachable from startSES's root, and therefore not freezable by
   * startSES's normal whitelist traversal. However, freezing these
   * during repairES5.js may be too early, as it is before WeakMap.js
   * has had a chance to monkey patch Object.freeze if necessary, in
   * order to install hidden properties for its own use before the
   * object becomes non-extensible.
   * TODO(kpreid): Revisit this time-of-execution commentary in new world
   */
  function rememberToTamperProof(obj) {
    needToTamperProof.push(obj);
  }

  /**
   * Makes and returns a tamperProof(obj) function, and uses it to
   * tamper proof all objects whose tamper proofing had been delayed.
   *
   * <p>"makeDelayedTamperProof()" must only be called once.
   */
  var makeDelayedTamperProofCalled = false;
  ses.makeDelayedTamperProof = function makeDelayedTamperProof() {
    if (makeDelayedTamperProofCalled) {
      throw 'makeDelayedTamperProof() must only be called once.';
    }
    var tamperProof = makeTamperProof();
    strictForEachFn(needToTamperProof, tamperProof);
    needToTamperProof = void 0;
    makeDelayedTamperProofCalled = true;
    return tamperProof;
  };


  ////////////////////// Brand testing /////////////////////

  /**
   * Note that, as of ES5, Object.prototype.toString.call(foo) (for
   * the original Object.prototype.toString and original
   * Function.prototype.call) was a reliable branding mechanism for
   * distinguishing the built-in types. This is no longer true of ES6
   * once untrusted code runs in that realm, and so should no longer
   * be used for that purpose. See makeBrandTester and the brands it
   * makes.
   */
  var objToString = Object.prototype.toString;

  /**
   * For reliably testing that a specimen is an exotic object of some
   * built-in exotic type.
   *
   * <p>The exotic type should be those objects normally made by
   * ctor. methodName must be the name of a method on ctor.prototype
   * that, when applied to an exotic object of this exotic type as
   * this-value, with the provided args list, will return without
   * error, but when applied to any other object as this-value will
   * throw an error. opt_example, if provided, must be an example of
   * such an exotic object that can be used for internal sanity
   * checking before returning a brandTester.
   *
   * <p>Uses Allen's trick from
   * https://esdiscuss.org/topic/tostringtag-spoofing-for-null-and-undefined#content-59
   * for brand testing that will remain reliable in ES6.
   * However, testing reveals that, on FF 35.0.1, a proxy on an exotic
   * object X will pass this brand test when X will. This is fixed as of
   * FF Nightly 38.0a1.
   *
   * <p>Returns a brandTester function such that, if brandTester(specimen)
   * returns true, this is a reliable indicator that specimen actually
   * is an exotic object of that type.
   *
   * <p>As a convenience, ctor may be undefined, in which
   * case we assume that there are no exotic objects of that kind. In
   * this case, the returned brandTester always says false.
   */
  function makeBrandTester(ctor, methodName, args, opt_example) {
    if (ctor === void 0) {
      // If there is no built-in ctor, then we assume there cannot
      // be any objects that are genuinely of that brand.
      return function absentCtorBrandTester(specimen) { return false; };
    }
    var originalMethod = ctor.prototype[methodName];
    function brandTester(specimen) {
      if (specimen !== Object(specimen)) { return false; }
      try {
        originalMethod.apply(specimen, args);
        return true;
      } catch (_) {
        return false;
      }
    };
    // a bit of sanity checking before proceeding
    var counterExamples = [null, void 0, true, 1, 'x', {}];
    if (opt_example !== void 0) {
      counterExamples.push({valueOf: function() { return opt_example; }});
      counterExamples.push(Object.create(opt_example));
    }
    strictForEachFn(counterExamples, function(v, i) {
      if (brandTester(v)) {
        logger.error('Brand test ' + i + ' for ' + ctor + ' passed: ' + v);
        ses._repairer.updateMaxSeverity(severities.NOT_SUPPORTED);
      }
    });
    if (opt_example !== void 0 && typeof global.Proxy === 'function') {
      // We treat the Proxy counter-example more gently for two reasons:
      // * The test fails as of FF 35.0.1, which, as of this writing,
      //   Caja must still support.
      // * It currently does not cause an insecurity for us, since we
      //   do not yet whitelist Proxy. We might use it internally (see
      //   startSES.js) but we do not yet make it available to any
      //   code running within SES.
      // See https://bugzilla.mozilla.org/show_bug.cgi?id=1133249
      // TODO(erights): Add a test for this to test262
      // TODO(erights): Extract all these self-tests into tests
      // performed within the repair framework.
      // TODO(erights): Add a self-test that will catch any
      // whitelisting of Proxy while this is still an issue.
      var proxy = new global.Proxy(opt_example, {});
      if (brandTester(proxy)) {
        logger.warn('Brand test of proxy for ' + ctor + ' passed: ' + proxy);
        ses._repairer.updateMaxSeverity(severities.SAFE_SPEC_VIOLATION);
      }
    }
    if (opt_example !== void 0 && !brandTester(opt_example)) {
      logger.error('Brand test for ' + ctor + ' failed: ' + opt_example);
      ses._repairer.updateMaxSeverity(severities.NOT_SUPPORTED);
    }
    return brandTester;
  }

  /**
   * A reliable brand test for whether specimen has a [[Class]] of
   * "Date", or, in ES6 terminology, whether it has a [[DateValue]]
   * internal slot.
   */
  var isBuiltinDate = makeBrandTester(
      Date, 'getDay', [], new Date());

  /**
   * A reliable brand test for whether specimen has a [[Class]] of
   * "Number", or, in ES6 terminology, whether it has a [[NumberData]]
   * internal slot.
   */
  var isBuiltinNumberObject = makeBrandTester(
      Number, 'toString', [], new Number(3));

  /**
   * A reliable brand test for whether specimen has a [[Class]] of
   * "Boolean", or, in ES6 terminology, whether it has a [[BooleanData]]
   * internal slot.
   */
  var isBuiltinBooleanObject = makeBrandTester(
      Boolean, 'toString', [], new Boolean(true));

  /**
   * A reliable brand test for whether specimen has a [[Class]] of
   * "String", or, in ES6 terminology, whether it has a [[StringData]]
   * internal slot.
   */
  var isBuiltinStringObject = makeBrandTester(
      String, 'toString', [], new String('y'));

  /**
   * A reliable brand test for whether specimen has a [[Class]] of
   * "RegExp", or, in ES6 terminology, whether it has a [[RegExpMatcher]]
   * internal slot.
   */
  var isBuiltinRegExp = makeBrandTester(
      RegExp, 'exec', ['x'], /x/);

  /**
   * A reliable brand test for whether specimen has a [[WeakMapData]]
   * internal slot.
   */
  var isBuiltinWeakMap = makeBrandTester(
      global.WeakMap, 'get', [{}], global.WeakMap ? new WeakMap() : void 0);


  //////////////// Undeniables and Intrinsics //////////////


  /**
   * A known strict function which returns its arguments object.
   */
  function strictArguments() { return arguments; }

  /**
   * A known sloppy function which returns its arguments object.
   *
   * Defined using Function so it'll be sloppy (not strict and not
   * builtin).
   */
  var sloppyArguments = Function('return arguments;');

  /**
   * If present, a known strict generator function which yields its
   * arguments object.
   *
   * <p>TODO: once all supported browsers implement ES6 generators, we
   * can drop the "try"s below, drop the check for old Mozilla
   * generator syntax, and treat strictArgumentsGenerator as
   * unconditional in the test of the code.
   */
  var strictArgumentsGenerator = void 0;
  try {
    // ES6 syntax
    strictArgumentsGenerator =
        eval('(function*() { "use strict"; yield arguments; })');
  } catch (ex) {
    if (!(ex instanceof SyntaxError)) { throw ex; }
    try {
      // Old Firefox syntax
      strictArgumentsGenerator =
          eval('(function() { "use strict"; yield arguments; })');
    } catch (ex2) {
      if (!(ex2 instanceof SyntaxError)) { throw ex2; }
    }
  }

  /**
   * The undeniables are the primordial objects which are ambiently
   * reachable via compositions of strict syntax, primitive wrapping
   * (new Object(x)), and prototype navigation (the equivalent of
   * Object.getPrototypeOf(x) or x.__proto__). Although we could in
   * theory monkey patch primitive wrapping or prototype navigation,
   * we won't. Hence, without parsing, the following are undeniable no
   * matter what <i>other</i> monkey patching we do to the primordial
   * environment.
   */
  function getUndeniables() {
    var gopd = Object.getOwnPropertyDescriptor;
    var getProto = Object.getPrototypeOf;

    // The first element of each undeniableTuple is a string used to
    // name the undeniable object for reporting purposes. It has no
    // other programmatic use.
    //
    // The second element of each undeniableTuple should be the
    // undeniable itself.
    //
    // The optional third element of the undeniableTuple, if present,
    // should be an example of syntax, rather than use of a monkey
    // patchable API, evaluating to a value from which the undeniable
    // object in the second element can be reached by only the
    // following steps:
    // If the value is primitve, convert to an Object wrapper.
    // Is the resulting object either the undeniable object, or does
    // it inherit directly from the undeniable object?

    var undeniableTuples = [
        ['Object.prototype', Object.prototype, {}],
        ['Function.prototype', Function.prototype, function(){}],
        ['Array.prototype', Array.prototype, []],
        ['RegExp.prototype', RegExp.prototype, /x/],
        ['Boolean.prototype', Boolean.prototype, true],
        ['Number.prototype', Number.prototype, 1],
        ['String.prototype', String.prototype, 'x'],
    ];
    var result = {};

    // Get the ES6 %Generator% intrinsic, if present.
    // It is undeniable because individual generator functions inherit
    // from it.
    (function() {
      // See http://people.mozilla.org/~jorendorff/figure-2.png
      // i.e., Figure 2 of section 25.2 "Generator Functions" of the
      // ES6 spec.
      // https://people.mozilla.org/~jorendorff/es6-draft.html#sec-generatorfunction-objects
      if (!strictArgumentsGenerator) { return; }
      var Generator = getProto(strictArgumentsGenerator);
      undeniableTuples.push(['%Generator%', Generator,
                             strictArgumentsGenerator]);
      strictArgumentsGenerator = strictArgumentsGenerator;
    }());

    strictForEachFn(undeniableTuples, function(tuple) {
      var name = tuple[0];
      var undeniable = tuple[1];
      var start = tuple[2];
      result[name] = undeniable;
      if (start === void 0) { return; }
      start = Object(start);
      if (undeniable === start) { return; }
      if (undeniable === getProto(start)) { return; }
      throw new Error('Unexpected undeniable: ' + undeniable);
    });

    return result;
  }
  ses.getUndeniables = getUndeniables;

  // For consistency checking, once we've done all our whitelist
  // processing and monkey patching, we will call getUndeniables again
  // and check that the undeniables are the same.
  ses.earlyUndeniables = getUndeniables();


  function registerIteratorProtos(registery, base, name) {
    var iteratorSym = global.Symbol && global.Symbol.iterator ||
        "@@iterator"; // used instead of a symbol on FF35
    var getProto = Object.getPrototypeOf;

    if (base[iteratorSym]) {
      var anIter = base[iteratorSym]();
      var anIteratorPrototype = getProto(anIter);
      registery[name] = anIteratorPrototype;
      var anIterProtoBase = getProto(anIteratorPrototype);
      if (anIterProtoBase !== Object.prototype) {
        if (!registery.IteratorPrototype) {
          if (getProto(anIterProtoBase) !== Object.prototype) {
            throw new Error(
              '%IteratorPrototype%.__proto__ was not Object.prototype');
          }
          registery.IteratorPrototype = anIterProtoBase;
        } else {
          if (registery.IteratorPrototype !== anIterProtoBase) {
            throw new Error('unexpected %' + name + '%.__proto__');
          }
        }
      }
    }
  }


  /**
   * Get the intrinsics not otherwise reachable by named own property
   * traversal. See
   * https://people.mozilla.org/~jorendorff/es6-draft.html#sec-well-known-intrinsic-objects
   * and the instrinsics section of whitelist.js
   *
   * <p>Unlike getUndeniables(), the result of getAnonIntrinsics()
   * does depend on the current state of the primordials, so we must
   * run this again after all other relevant monkey patching is done,
   * in order to properly initialize cajaVM.intrinsics
   */
  function getAnonIntrinsics() {
    var gopd = Object.getOwnPropertyDescriptor;
    var getProto = Object.getPrototypeOf;
    var result = {};

    // If there are still other ThrowTypeError objects left after
    // noFuncPoison-ing, this should be caught by
    // test_THROWTYPEERROR_NOT_UNIQUE below, so we assume here that
    // this is the only surviving ThrowTypeError intrinsic.
    result.ThrowTypeError = gopd(arguments, 'callee').get;

    // Get the ES6 %ArrayIteratorPrototype%,
    // %StringIteratorPrototype%, %MapIteratorPrototype%,
    // %SetIteratorPrototype% and %IteratorPrototype% intrinsics, if
    // present.
    (function() {
      registerIteratorProtos(result, [], 'ArrayIteratorPrototype');
      registerIteratorProtos(result, '', 'StringIteratorPrototype');
      if (typeof Map === 'function') {
        registerIteratorProtos(result, new Map(), 'MapIteratorPrototype');
      }
      if (typeof Set === 'function') {
        registerIteratorProtos(result, new Set(), 'SetIteratorPrototype');
      }
    }());

    // Get the ES6 %GeneratorFunction% intrinsic, if present.
    (function() {
      var Generator = ses.earlyUndeniables['%Generator%'];
      if (!Generator || Generator === Function.prototype) { return; }
      if (getProto(Generator) !== Function.prototype) {
        throw new Error('Generator.__proto__ was not Function.prototype');
      }
      var GeneratorFunction = Generator.constructor;
      if (GeneratorFunction === Function) { return; }
      if (getProto(GeneratorFunction) !== Function) {
        throw new Error('GeneratorFunction.__proto__ was not Function');
      }
      result.GeneratorFunction = GeneratorFunction;
      var genProtoBase = getProto(Generator.prototype);
      if (genProtoBase !== result.IteratorPrototype &&
          genProtoBase !== Object.prototype) {
        throw new Error('Unexpected Generator.prototype.__proto__');
      }
    }());

    // Get the ES6 %TypedArray% intrinsic, if present.
    (function() {
      if (!global.Float32Array) { return; }
      var TypedArray = getProto(global.Float32Array);
      if (TypedArray === Function.prototype) { return; }
      if (getProto(TypedArray) !== Function.prototype) {
        // http://bespin.cz/~ondras/html/classv8_1_1ArrayBufferView.html
        // has me worried that someone might make such an intermediate
        // object visible.
        throw new Error('TypedArray.__proto__ was not Function.prototype');
      }
      result.TypedArray = TypedArray;
    }());

    for (var name in result) {
      if (result[name] === void 0) {
        throw new Error('Malformed intrinsic: ' + name);
      }
    }

    return result;
  }
  ses.getAnonIntrinsics = getAnonIntrinsics;

  var unsafeIntrinsics = getAnonIntrinsics();

