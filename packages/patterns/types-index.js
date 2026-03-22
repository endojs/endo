// Re-export matches, mustMatch, and M so they get typed declarations
// from types-index.d.ts (which supports asserts/type-predicate signatures
// and namespace merging that JSDoc cannot express).
export { matches, mustMatch, M } from './src/patterns/patternMatchers.js';
