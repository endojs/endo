/* global globalThis */

import { patchTextDecoderFastPath } from './text-decoder-fast-path-patch.js';

// The post lockdown thunk.
export default () => {
  // Even on non-v8, we tame the start compartment's Error constructor so
  // this assignment is not rejected, even if it does nothing.
  Error.stackTraceLimit = Infinity;

  // Mitigate https://github.com/endojs/endo/issues/2813. Must precede the
  // `harden(globalThis.TextDecoder)` below so that the wrapped constructor and
  // the accessors it installs on `TextDecoder.prototype` are part of the
  // hardened object graph.
  patchTextDecoderFastPath();

  harden(globalThis.TextEncoder); // Absent in eshost
  harden(globalThis.TextDecoder); // Absent in eshost
  harden(globalThis.URL); // Absent only on XSnap
  harden(globalThis.Base64); // Present only on XSnap
};
