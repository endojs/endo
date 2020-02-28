// Copyright (C) 2011 Google Inc.
// Copyright (C) 2018 Agoric
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
 * intrinsic objects and methods not yet being perturbed.
 *
 * <p>TODO(erights): This file tries to protect itself from some
 * post-initialization perturbation by stashing some of the
 * intrinsics it needs for later use, but this attempt is currently
 * incomplete. We need to revisit this when we support Confined-ES5,
 * as a variant of SES in which the intrinsics are not frozen. See
 * previous failed attempt at <a
 * href="https://codereview.appspot.com/5278046/" >Speeds up
 * WeakMap. Preparing to support unfrozen intrinsics.</a>. From
 * analysis of this failed attempt, it seems that the only practical
 * way to support CES is by use of two frames, where most of initSES
 * runs in a SES frame, and so can avoid worrying about most of these
 * perturbations.
 */
function getAnonIntrinsics(global) {
  'use strict';

  const gopd = Object.getOwnPropertyDescriptor;
  const getProto = Object.getPrototypeOf;

  // ////////////// Undeniables and Intrinsics //////////////

  /**
   * The undeniables are the intrinsic objects which are ambiently
   * reachable via compositions of strict syntax, primitive wrapping
   * (new Object(x)), and prototype navigation (the equivalent of
   * Object.getPrototypeOf(x) or x.__proto__). Although we could in
   * theory monkey patch primitive wrapping or prototype navigation,
   * we won't. Hence, without parsing, the following are undeniable no
   * matter what <i>other</i> monkey patching we do to the primal
   * realm.
   */

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

  function* aStrictGenerator() {} // eslint-disable-line no-empty-function
  const Generator = getProto(aStrictGenerator);
  async function* aStrictAsyncGenerator() {} // eslint-disable-line no-empty-function
  const AsyncGenerator = getProto(aStrictAsyncGenerator);
  async function aStrictAsyncFunction() {} // eslint-disable-line no-empty-function
  const AsyncFunctionPrototype = getProto(aStrictAsyncFunction);

  // TODO: this is dead code, but could be useful: make this the
  // 'undeniables' object available via some API.

  const undeniableTuples = [
    ['Object.prototype', Object.prototype, {}],
    ['Function.prototype', Function.prototype, function foo() {}],
    ['Array.prototype', Array.prototype, []],
    ['RegExp.prototype', RegExp.prototype, /x/],
    ['Boolean.prototype', Boolean.prototype, true],
    ['Number.prototype', Number.prototype, 1],
    ['String.prototype', String.prototype, 'x'],
    ['%Generator%', Generator, aStrictGenerator],
    ['%AsyncGenerator%', AsyncGenerator, aStrictAsyncGenerator],
    ['%AsyncFunction%', AsyncFunctionPrototype, aStrictAsyncFunction],
  ];
  const undeniables = {};

  undeniableTuples.forEach(tuple => {
    const name = tuple[0];
    const undeniable = tuple[1];
    let start = tuple[2];
    undeniables[name] = undeniable;
    if (start === undefined) {
      return;
    }
    start = Object(start);
    if (undeniable === start) {
      return;
    }
    if (undeniable === getProto(start)) {
      return;
    }
    throw new Error(`Unexpected undeniable: ${undeniable}`);
  });

  function registerIteratorProtos(registery, base, name) {
    const iteratorSym =
      (global.Symbol && global.Symbol.iterator) || '@@iterator'; // used instead of a symbol on FF35

    if (base[iteratorSym]) {
      const anIter = base[iteratorSym]();
      const anIteratorPrototype = getProto(anIter);
      registery[name] = anIteratorPrototype;
      const anIterProtoBase = getProto(anIteratorPrototype);
      if (anIterProtoBase !== Object.prototype) {
        if (!registery.IteratorPrototype) {
          if (getProto(anIterProtoBase) !== Object.prototype) {
            throw new Error(
              '%IteratorPrototype%.__proto__ was not Object.prototype',
            );
          }
          registery.IteratorPrototype = anIterProtoBase;
        } else if (registery.IteratorPrototype !== anIterProtoBase) {
          throw new Error(`unexpected %${name}%.__proto__`);
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
   * <p>Unlike getUndeniables(), the result of sampleAnonIntrinsics()
   * does depend on the current state of the intrinsics, so we must
   * run this again after all other relevant monkey patching is done,
   * in order to properly initialize the list of intrinsics.
   */

  // TODO: we can probably unwrap this into the outer function, and stop
  // using a separately named 'sampleAnonIntrinsics'
  function sampleAnonIntrinsics() {
    const result = {};

    // If there are still other ThrowTypeError objects left after
    // noFuncPoison-ing, this should be caught by
    // test_THROWTYPEERROR_NOT_UNIQUE below, so we assume here that
    // this is the only surviving ThrowTypeError intrinsic.
    // eslint-disable-next-line prefer-rest-params
    result.ThrowTypeError = gopd(arguments, 'callee').get;

    // Get the ES6 %ArrayIteratorPrototype%,
    // %StringIteratorPrototype%, %MapIteratorPrototype%,
    // %SetIteratorPrototype% and %IteratorPrototype% intrinsics, if
    // present.
    registerIteratorProtos(result, [], 'ArrayIteratorPrototype');
    registerIteratorProtos(result, '', 'StringIteratorPrototype');
    if (typeof Map === 'function') {
      registerIteratorProtos(result, new Map(), 'MapIteratorPrototype');
    }
    if (typeof Set === 'function') {
      registerIteratorProtos(result, new Set(), 'SetIteratorPrototype');
    }

    // Get the ES6 %GeneratorFunction% intrinsic, if present.
    if (getProto(Generator) !== Function.prototype) {
      throw new Error('Generator.__proto__ was not Function.prototype');
    }
    const GeneratorFunction = Generator.constructor;
    if (getProto(GeneratorFunction) !== Function.prototype.constructor) {
      throw new Error(
        'GeneratorFunction.__proto__ was not Function.prototype.constructor',
      );
    }
    result.GeneratorFunction = GeneratorFunction;
    const genProtoBase = getProto(Generator.prototype);
    if (genProtoBase !== result.IteratorPrototype) {
      throw new Error('Unexpected Generator.prototype.__proto__');
    }

    // Get the ES6 %AsyncGeneratorFunction% intrinsic, if present.
    if (getProto(AsyncGenerator) !== Function.prototype) {
      throw new Error('AsyncGenerator.__proto__ was not Function.prototype');
    }
    const AsyncGeneratorFunction = AsyncGenerator.constructor;
    if (getProto(AsyncGeneratorFunction) !== Function.prototype.constructor) {
      throw new Error(
        'GeneratorFunction.__proto__ was not Function.prototype.constructor',
      );
    }
    result.AsyncGeneratorFunction = AsyncGeneratorFunction;
    // it appears that the only way to get an AsyncIteratorPrototype is
    // through this getProto() process, so there's nothing to check it
    // against
    /*
      const agenProtoBase = getProto(AsyncGenerator.prototype);
      if (agenProtoBase !== result.AsyncIteratorPrototype) {
        throw new Error('Unexpected AsyncGenerator.prototype.__proto__');
      } */

    // Get the ES6 %AsyncFunction% intrinsic, if present.
    if (getProto(AsyncFunctionPrototype) !== Function.prototype) {
      throw new Error(
        'AsyncFunctionPrototype.__proto__ was not Function.prototype',
      );
    }
    const AsyncFunction = AsyncFunctionPrototype.constructor;
    if (getProto(AsyncFunction) !== Function.prototype.constructor) {
      throw new Error(
        'AsyncFunction.__proto__ was not Function.prototype.constructor',
      );
    }
    result.AsyncFunction = AsyncFunction;

    // Get the ES6 %TypedArray% intrinsic, if present.
    (function getTypedArray() {
      if (!global.Float32Array) {
        return;
      }
      const TypedArray = getProto(global.Float32Array);
      if (TypedArray === Function.prototype) {
        return;
      }
      if (getProto(TypedArray) !== Function.prototype) {
        // http://bespin.cz/~ondras/html/classv8_1_1ArrayBufferView.html
        // has me worried that someone might make such an intermediate
        // object visible.
        throw new Error('TypedArray.__proto__ was not Function.prototype');
      }
      result.TypedArray = TypedArray;
    })();

    Object.keys(result).forEach(name => {
      if (result[name] === undefined) {
        throw new Error(`Malformed intrinsic: ${name}`);
      }
    });

    return result;
  }

  return sampleAnonIntrinsics();
}

export default getAnonIntrinsics;
