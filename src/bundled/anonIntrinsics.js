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
export function getAnonIntrinsics(global) {
  "use strict";

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

  // For consistency checking, once we've done all our whitelist
  // processing and monkey patching, we will call getUndeniables again
  // and check that the undeniables are the same.
  const earlyUndeniables = getUndeniables();


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
      var Generator = earlyUndeniables['%Generator%'];
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

  return getAnonIntrinsics();
}
