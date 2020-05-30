// The intrinsics are the defiend in the global specifications.
//
// API
//
//   getIntrinsics(): Object
//
// Operation similar to abstract operation `CreateInrinsics` in section 8.2.2
// of the ES specifications.
//
// Return a record-like object similar to the [[intrinsics]] slot of the
// realmRec excepts for the following simpifications:
//
//  - we omit the intrinsics not reachable by JavaScript code.
//
//  - we omit intrinsics that are direct properties of the global object
//    (except for the "prototype" property), and properties that are direct
//    properties of the prototypes (except for "constructor").
//
//  - we use the name of the associated global object property instead of the
//    intrinsic name (usually, `<intrinsic name> === '%' + <global property
//    name>+ '%'`).
//
// Assumptions
//
// The intrinsic names correspond to the object names with "%" added as prefix and suffix, i.e. the intrinsic "%Object%" is equal to the global object property "Object".

import { objectHasOwnProperty } from './commons.js';
import { checkAnonIntrinsics } from './check-anon-intrinsics.js';
import { getAnonymousIntrinsics } from './get-anonymous-intrinsics.js';
import { intrinsicNames } from './intrinsic-names.js';
import { getNamedIntrinsic } from './get-named-intrinsic.js';
import { checkIntrinsics } from './check-intrinsics.js';

const suffix = 'Prototype';

/**
 * getIntrinsics()
 * Return a record-like object similar to the [[intrinsics]] slot of the realmRec
 * excepts for the following simpifications:
 * - we omit the intrinsics not reachable by JavaScript code.
 * - we omit intrinsics that are direct properties of the global object (except for the
 *   "prototype" property), and properties that are direct properties of the prototypes
 *   (except for "constructor").
 * - we use the name of the associated global object property instead of the intrinsic
 *   name (usually, <intrinsic name> === '%' + <global property name>+ '%').
 */
export function getIntrinsics() {
  const intrinsics = { __proto__: null };

  const anonIntrinsics = getAnonymousIntrinsics();
  checkAnonIntrinsics(anonIntrinsics);

  for (const name of intrinsicNames) {
    if (objectHasOwnProperty(anonIntrinsics, name)) {
      intrinsics[name] = anonIntrinsics[name];
      // eslint-disable-next-line no-continue
      continue;
    }

    if (objectHasOwnProperty(globalThis, name)) {
      intrinsics[name] = getNamedIntrinsic(globalThis, name);
      // eslint-disable-next-line no-continue
      continue;
    }

    const hasSuffix = name.endsWith(suffix);
    if (hasSuffix) {
      const prefix = name.slice(0, -suffix.length);

      if (objectHasOwnProperty(anonIntrinsics, prefix)) {
        const intrinsic = anonIntrinsics[prefix];
        intrinsics[name] = intrinsic.prototype;
        // eslint-disable-next-line no-continue
        continue;
      }

      if (objectHasOwnProperty(globalThis, prefix)) {
        const intrinsic = getNamedIntrinsic(globalThis, prefix);
        intrinsics[name] = intrinsic.prototype;
        // eslint-disable-next-line no-continue
        continue;
      }
    }
  }

  checkIntrinsics(intrinsics);

  return intrinsics;
}
