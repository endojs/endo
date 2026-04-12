/* eslint-disable */
// Re-export matches, mustMatch, and M so they get typed declarations
// from types-index.d.ts (which supports asserts/type-predicate signatures
// and namespace merging that JSDoc cannot express).
export { matches, mustMatch, M } from './src/patterns/patternMatchers.js';

// --- Subtype verification ---
// The declare-function overlays in type-from-pattern.ts narrow the runtime
// signatures (adding type predicates / asserts).  The assignments below
// verify that the runtime implementations are assignable to the widened
// (non-predicate) base signatures.  If the runtime drifts, these lines
// will produce a type error in this (non-@ts-nocheck) file.
import {
  matches as _m,
  mustMatch as _mm,
} from './src/patterns/patternMatchers.js';
/** @type {(specimen: unknown, patt: import('./src/types.js').Pattern) => boolean} */
const _matchesCompat = _m;
/** @type {(specimen: unknown, patt: import('./src/types.js').Pattern, label?: string | number) => void} */
const _mustMatchCompat = _mm;
// eslint-disable-next-line no-void
(void _matchesCompat, _mustMatchCompat);
