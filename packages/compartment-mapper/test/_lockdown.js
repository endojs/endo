// Calls `lockdown()` at module-top so it runs before any sibling
// imports that transitively load `@endo/hex` (via `node-powers.js`)
// or other modules that call `harden()` at top level.  ESM evaluates
// each importer's dependencies in source order; importing this module
// first guarantees that lockdown completes before subsequent imports
// run their module bodies.
//
// The JSONP parser uses harden, as a bit.

import 'ses';

lockdown({
  errorTaming: 'unsafe',
  errorTrapping: 'none',
});
