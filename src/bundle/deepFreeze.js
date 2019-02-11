// Adapted from SES/Caja - Copyright (C) 2011 Google Inc.
// Copyright (C) 2018 Agoric

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

// based upon:
// https://github.com/google/caja/blob/master/src/com/google/caja/ses/startSES.js
// https://github.com/google/caja/blob/master/src/com/google/caja/ses/repairES5.js
// then copied from proposal-frozen-realms deep-freeze.js

export function deepFreeze(root) {
  const { freeze, getOwnPropertyDescriptors, getPrototypeOf } = Object;
  const { ownKeys } = Reflect;

  // Objects that are deeply frozen.
  const frozenSet = new WeakSet();

  /**
   * "innerDeepFreeze()" acts like "Object.freeze()", except that:
   *
   * To deepFreeze an object is to freeze it and all objects transitively
   * reachable from it via transitive reflective property and prototype
   * traversal.
   */
  function innerDeepFreeze(node) {
    // Objects that we have frozen in this round.
    const freezingSet = new Set();

    // If val is something we should be freezing but aren't yet,
    // add it to freezingSet.
    function enqueue(val) {
      if (Object(val) !== val) {
        // ignore primitives
        return;
      }
      const type = typeof val;
      if (type !== 'object' && type !== 'function') {
        // future proof: break until someone figures out what it should do
        throw new TypeError(`Unexpected typeof: ${type}`);
      }
      if (frozenSet.has(val) || freezingSet.has(val)) {
        // todo use uncurried form
        // Ignore if already frozen or freezing
        return;
      }
      freezingSet.add(val); // todo use uncurried form
    }

    function doFreeze(obj) {
      // Immediately freeze the object to ensure reactive
      // objects such as proxies won't add properties
      // during traversal, before they get frozen.

      // Object are verified before being enqueued,
      // therefore this is a valid candidate.
      // Throws if this fails (strict mode).
      freeze(obj);

      // we rely upon certain commitments of Object.freeze and proxies here

      // get stable/immutable outbound links before a Proxy has a chance to do
      // something sneaky.
      const proto = getPrototypeOf(obj);
      const descs = getOwnPropertyDescriptors(obj);
      enqueue(proto);
      ownKeys(descs).forEach(name => {
        // todo uncurried form
        // todo: getOwnPropertyDescriptors is guaranteed to return well-formed
        // descriptors, but they still inherit from Object.prototype. If
        // someone has poisoned Object.prototype to add 'value' or 'get'
        // properties, then a simple 'if ("value" in desc)' or 'desc.value'
        // test could be confused. We use hasOwnProperty to be sure about
        // whether 'value' is present or not, which tells us for sure that this
        // is a data property.
        const desc = descs[name];
        if ('value' in desc) {
          // todo uncurried form
          enqueue(desc.value);
        } else {
          enqueue(desc.get);
          enqueue(desc.set);
        }
      });
    }

    function dequeue() {
      // New values added before forEach() has finished will be visited.
      freezingSet.forEach(doFreeze); // todo curried forEach
    }

    function commit() {
      // todo curried forEach
      // we capture the real WeakSet.prototype.add above, in case someone
      // changes it. The two-argument form of forEach passes the second
      // argument as the 'this' binding, so we add to the correct set.
      freezingSet.forEach(frozenSet.add, frozenSet);
    }

    enqueue(node);
    dequeue();
    commit();
  }

  innerDeepFreeze(root);
  return root;
}

export function deepFreezePrimordials(global) {
  const primordialRoots = {
    global,
    // todo: add other roots, to reach the
    // unreachables/"anonIntrinsics": see
    // whitelist.js for a list
    // anonIntrinsics: getAnonIntrinsics(global)
  };
  deepFreeze(primordialRoots);
}
