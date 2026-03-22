// Pure re-export index — type definitions belong in .ts files.
// See AGENTS.md for the types-index convention.
export type * from './src/types.js';
export type * from './src/type-from-pattern.js';

// Value + namespace declarations (M, matches, mustMatch) are defined in
// src/type-from-pattern.ts and re-exported here.  The runtime code lives
// in types-index.js which re-exports from patternMatchers.js.
export { M, matches, mustMatch } from './src/type-from-pattern.js';
