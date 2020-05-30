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
// then copied from SES/src/bundle/deepFreeze.js

const { freeze, getOwnPropertyDescriptors, getPrototypeOf } = Object;
const { ownKeys } = Reflect;

/**
 * Create a `harden` function.
 */
function makeHardener() {
  if (arguments.length >= 1) {
    // TODO Just a transitional test. Remove when safe to do so.
    throw new TypeError('makeHardener no longer takes any options');
  }

  // Objects that we won't freeze, either because we've frozen them already,
  // or they were one of the initial roots (terminals). These objects form
  // the "fringe" of the hardened object graph.
  const fringeSet = new WeakSet();

  const { harden } = {
    harden(root) {
      const toFreeze = new Set();
      const prototypes = new Map();
      const paths = new WeakMap();

      // If val is something we should be freezing but aren't yet,
      // add it to toFreeze.
      function enqueue(val, path) {
        if (Object(val) !== val) {
          // ignore primitives
          return;
        }
        const type = typeof val;
        if (type !== 'object' && type !== 'function') {
          // future proof: break until someone figures out what it should do
          throw new TypeError(`Unexpected typeof: ${type}`);
        }
        if (fringeSet.has(val) || toFreeze.has(val)) {
          // Ignore if this is an exit, or we've already visited it
          return;
        }
        // console.log(`adding ${val} to toFreeze`, val);
        toFreeze.add(val);
        paths.set(val, path);
      }

      function freezeAndTraverse(obj) {
        // Now freeze the object to ensure reactive
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
        const path = paths.get(obj) || 'unknown';

        // console.log(`adding ${proto} to prototypes under ${path}`);
        if (proto !== null && !prototypes.has(proto)) {
          prototypes.set(proto, path);
          paths.set(proto, `${path}.__proto__`);
        }

        ownKeys(descs).forEach(name => {
          const pathname = `${path}.${String(name)}`;
          // todo uncurried form
          // todo: getOwnPropertyDescriptors is guaranteed to return well-formed
          // descriptors, but they still inherit from Object.prototype. If
          // someone has poisoned Object.prototype to add 'value' or 'get'
          // properties, then a simple 'if ("value" in desc)' or 'desc.value'
          // test could be confused. We use hasOwnProperty to be sure about
          // whether 'value' is present or not, which tells us for sure that
          // this is a data property.
          const desc = descs[name];
          if ('value' in desc) {
            // todo uncurried form
            enqueue(desc.value, `${pathname}`);
          } else {
            enqueue(desc.get, `${pathname}(get)`);
            enqueue(desc.set, `${pathname}(set)`);
          }
        });
      }

      function dequeue() {
        // New values added before forEach() has finished will be visited.
        toFreeze.forEach(freezeAndTraverse); // todo curried forEach
      }

      function checkPrototypes() {
        prototypes.forEach((path, p) => {
          if (!(toFreeze.has(p) || fringeSet.has(p))) {
            // all reachable properties have already been frozen by this point
            let msg;
            try {
              msg = `prototype ${p} of ${path} is not already in the fringeSet`;
            } catch (e) {
              // `${(async _=>_).__proto__}` fails in most engines
              msg =
                'a prototype of something is not already in the fringeset (and .toString failed)';
              try {
                console.log(msg);
                console.log('the prototype:', p);
                console.log('of something:', path);
              } catch (_e) {
                // console.log might be missing in restrictive SES realms
              }
            }
            throw new TypeError(msg);
          }
        });
      }

      function commit() {
        // todo curried forEach
        // we capture the real WeakSet.prototype.add above, in case someone
        // changes it. The two-argument form of forEach passes the second
        // argument as the 'this' binding, so we add to the correct set.
        toFreeze.forEach(fringeSet.add, fringeSet);
      }

      enqueue(root);
      dequeue();
      // console.log("fringeSet", fringeSet);
      // console.log("prototype set:", prototypes);
      // console.log("toFreeze set:", toFreeze);
      checkPrototypes();
      commit();

      return root;
    },
  };

  return harden;
}

export default makeHardener;
