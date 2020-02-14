import { checkAnonIntrinsics } from './checkAnonIntrinsics.js';
import { getAnonymousIntrinsics } from './getAnonymousIntrinsics.js';
import { intrinsicNames } from './intrinsicNames.js';
import { getNamedIntrinsic } from './getNamedIntrinsic.js';
import { checkIntrinsics } from './checkIntrinsics.js';

const { apply } = Reflect;
const uncurryThis = fn => (thisArg, ...args) => apply(fn, thisArg, args);
const hasOwnProperty = uncurryThis(Object.prototype.hasOwnProperty);

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

  // eslint-disable-next-line no-new-func
  const global = Function('return this')(); // TODO replace root with globalThis
  const anonIntrinsics = getAnonymousIntrinsics();
  checkAnonIntrinsics(anonIntrinsics);

  for (const name of intrinsicNames) {
    if (hasOwnProperty(anonIntrinsics, name)) {
      intrinsics[name] = anonIntrinsics[name];
      // eslint-disable-next-line no-continue
      continue;
    }

    if (hasOwnProperty(global, name)) {
      intrinsics[name] = getNamedIntrinsic(global, name);
      // eslint-disable-next-line no-continue
      continue;
    }

    const hasSuffix = name.endsWith(suffix);
    if (hasSuffix) {
      const prefix = name.slice(0, -suffix.length);

      if (hasOwnProperty(anonIntrinsics, prefix)) {
        const intrinsic = anonIntrinsics[prefix];
        intrinsics[name] = intrinsic.prototype;
        // eslint-disable-next-line no-continue
        continue;
      }

      if (hasOwnProperty(global, prefix)) {
        const intrinsic = getNamedIntrinsic(global, prefix);
        intrinsics[name] = intrinsic.prototype;
        // eslint-disable-next-line no-continue
        continue;
      }
    }
  }

  checkIntrinsics(intrinsics);

  return intrinsics;
}
