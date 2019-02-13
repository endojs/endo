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

function makeHardener(...initialRoots) {
  const { freeze, getOwnPropertyDescriptors, getPrototypeOf } = Object;
  const { ownKeys } = Reflect;
  // Objects that we won't freeze, either because we've frozen them already,
  // or they were one of the initial roots (terminals)
  const rootSet = new WeakSet(initialRoots);

  function harden(root) {
    const toFreeze = new Set();
    const prototypes = new Map();

    function traverse(val, path) {
      // extend toFreeze and prototypes, and recurse
      if (Object(val) !== val) {
        // ignore primitives
        return;
      }
      const type = typeof val;
      if (type !== 'object' && type !== 'function') {
        // future proof: break until someone figures out what it should do
        throw new TypeError(`Unexpected typeof: ${type}`);
      }
      if (rootSet.has(val) || toFreeze.has(val)) {
        // Ignore if this is an exit, or we've already visited it
        return;
      }
      // console.log(`adding ${val} to toFreeze`, val);
      toFreeze.add(val);
      // console.log(`adding ${getPrototypeOf(val)} to prototypes under ${path}`);
      prototypes.set(getPrototypeOf(val), path);

      // TODO: Immediately freeze the object to ensure reactive objects such
      // as proxies won't add properties during traversal, before they get
      // frozen. (this is at odds with our goal of not freezing anything if a
      // prototype is not already in the rootSet)

      // now walk the enumerable properties
      const descs = getOwnPropertyDescriptors(val);
      ownKeys(descs).forEach(name => {
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
          traverse(desc.value, `${path}.${name}`);
        } else {
          traverse(desc.get, `${path}.${name}[get]`);
          traverse(desc.set, `${path}.${name}[set]`);
        }
      });
    }

    traverse(root, 'ROOT');

    // console.log("rootSet", rootSet);
    // console.log("prototype set:", prototypes);
    // console.log("toFreeze set:", toFreeze);
    prototypes.forEach((path, p) => {
      if (!rootSet.has(p)) {
        throw new TypeError(
          `prototype ${p} of ${path} is not already in the rootSet`,
        );
      }
    });

    toFreeze.forEach(val => {
      freeze(val);
      rootSet.add(val);
    });

    return root;
  }

  return harden;
}

module.exports = { makeHardener };
