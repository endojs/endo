// TODO this should be provided by the realm.

import { objectFreeze } from './commons';
import { createIntrinsics } from './intrinsics';

// Note: Instead of using a  safe*/unsafe* naming convention as a label to
// indentify sources of power, we simply use realmRec as the powerful object,
// and we always reference properties directly on it, which has the benefit
// of decreasing the number of moving parts.

/**
 * getCurrentRealmRec()
 * Creates a realm-like record, minus what we don't need or can't emulate.
 * The realm record (ECMAScript 8.2) holds the intrinsics, the global
 * object, the global environment, etc.
 */
export function getCurrentRealmRec() {
  const realmRec = {
    __proto__: null,
  };

  // We don't freeze the intrinsics record itself so it can be customized.
  realmRec.intrinsics = createIntrinsics();

  // However, we freeze the realm record for safety.
  return objectFreeze(realmRec);
}
