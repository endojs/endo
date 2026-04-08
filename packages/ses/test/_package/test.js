// @ts-nocheck
// node -r esm test.js
// Obsolete: node no longer supports `-r esm`; kept as reference only.
// See packages/ses/test/package.test.js where the `resm` case is commented out.

import '../../index.js';

lockdown();
console.log(Compartment);
