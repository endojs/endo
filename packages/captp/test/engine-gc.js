import v8 from 'v8';
import vm from 'vm';

/* global globalThis */
let bestGC = globalThis.gc;
if (typeof bestGC !== 'function') {
  // Node.js v8 wizardry.
  v8.setFlagsFromString('--expose_gc');
  bestGC = vm.runInNewContext('gc');
  // Hide the gc global from new contexts/workers.
  v8.setFlagsFromString('--no-expose_gc');
}

// Export a const.
const engineGC = bestGC;
export default engineGC;
