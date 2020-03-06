import { getGlobalIntrinsics } from './intrinsics-global.js';
import { objectFreeze } from './commons.js';

// Note: Instead of using a  safe*/unsafe* naming convention as a label to
// indentify sources of power, we simply use realmRec as the powerful object,
// and we always reference properties directly on it, which has the benefit
// of decreasing the number of moving parts.

let realmRec;

/**
 * getCurrentRealmRec()
 * Creates a realm-like record, minus what we don't need or can't emulate.
 * The realm record (ECMAScript 8.2) holds the intrinsics, the global
 * object, the global environment, etc.
 */
export function getCurrentRealmRec() {
  if (realmRec) {
    return realmRec;
  }

  // We don't freeze the intrinsics record itself so it can be customized.
  const intrinsics = getGlobalIntrinsics();

  realmRec = {
    __proto__: null,
    intrinsics,
  };

  // However, we freeze the realm record for safety.
  return objectFreeze(realmRec);
}
