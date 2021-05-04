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

// @ts-check

import {
  isPrimitive,
  isHardened,
  moreObjectsHardened,
} from './harden-branding.js';

const {
  getOwnPropertyDescriptors,
  getPrototypeOf,
  // This sampling happens after the harden-branding module is
  // initialized.
  // If harden-branding patches the stabilizers, then this
  // `Object.freeze` will be the patched one. Otherwise it will be the
  // original. We give it the funny name `patchedFreeze` here only to remind
  // ourselves of this possibility.
  freeze: patchedObjectFreeze,
} = Object;
const { ownKeys } = Reflect;

/**
 * @typedef {<T>(root: T) => T} Hardener
 */

/**
 * @template T
 * @param {T} root
 * @returns {T}
 */
const harden = root => {
  const toHarden = new Set();
  const paths = new WeakMap();

  // If val is something we should be freezing but aren't yet,
  // add it to toFreeze.
  /**
   * @param {any} val
   * @param {string} path
   */
  function enqueue(val, path) {
    if (isPrimitive(val)) {
      // ignore primitives
      return;
    }
    if (isHardened(val, path) || toHarden.has(val)) {
      // Ignore if this is an exit, or we're already visiting it
      return;
    }
    toHarden.add(val);
    paths.set(val, path);
  }

  /**
   * @param {any} obj
   */
  function freezeAndTraverse(obj) {
    // Now freeze the object to ensure reactive
    // objects such as proxies won't add properties
    // during traversal, before they get frozen.

    // Object are verified before being enqueued,
    // therefore this is a valid candidate.
    // Throws if this fails.
    patchedObjectFreeze(obj);

    // Now that the object is frozen, even if it is an evil proxy,
    // we're guaranteed that whatever own properties it reports are
    // stable --- it will always report exactly the same own properties
    // for all queries that return normally.)
    const path = paths.get(obj) || 'unknown';
    const descs = getOwnPropertyDescriptors(obj);
    const proto = getPrototypeOf(obj);
    enqueue(proto, `${path}.__proto__`);

    ownKeys(descs).forEach(name => {
      const pathname = `${path}.${String(name)}`;
      // Although `getOwnPropertyDescriptors` is guaranteed to return
      // well-formed descriptors, these descriptors still inherit from
      // `Object.prototype`. If
      // someone has poisoned `Object.prototype` to add `'value'` or `'get'`
      // properties, then our `if ('value' in desc)`
      // test below could be confused. However, `harden` is designed to be used
      // *only* in SES. In SES we don't have this hazard. And `in` may
      // be a cheaper test than `hasOwnProperty`, so we use `in` anyway.
      //
      // The `name` may be a symbol, and TypeScript doesn't like us to
      // index arbitrary symbols on objects, so we pretend `name` is just
      // a string.
      const desc = descs[/** @type {string} */ (name)];
      if ('value' in desc) {
        enqueue(desc.value, `${pathname}`);
      } else {
        enqueue(desc.get, `${pathname}(get)`);
        enqueue(desc.set, `${pathname}(set)`);
      }
    });
  }

  function dequeue() {
    // New values added before forEach() has finished will be visited.
    toHarden.forEach(freezeAndTraverse); // TODO curried forEach
  }

  enqueue(root, '<root>');
  dequeue();
  // The commit step. We must only record objects from `toHarden` as
  // hardened if we record all of them as hardened.
  moreObjectsHardened(toHarden);

  return root;
};

let called = false;

const makeHardener = () => {
  if (called) {
    throw new Error('makeHardener must only be called once');
  }
  called = true;
  return harden;
};

export default makeHardener;
