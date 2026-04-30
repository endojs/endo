// Property names whose use as path segments or object keys could compromise
// internals via prototype chain mutation (`__proto__`), constructor access
// (`constructor`), or prototype reach (`prototype`).  Used to defensively
// reject these names in path expressions, remap instructions, and decoded
// plain-object recursion.

import harden from '@endo/harden';

export const FORBIDDEN_PATH_KEYS = harden(
  new Set(['__proto__', 'constructor', 'prototype']),
);

/**
 * @param {unknown} key
 * @returns {boolean}
 */
export const isForbiddenKey = key =>
  typeof key === 'string' && FORBIDDEN_PATH_KEYS.has(key);
harden(isForbiddenKey);
