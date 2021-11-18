/* global globalThis */

// The post lockdown thunk.
export default () => {
  // Even on non-v8, we tame the start compartment's Error constructor so
  // this assignment is not rejected, even if it does nothing.
  Error.stackTraceLimit = Infinity;

  harden(TextEncoder);
  harden(TextDecoder);
  harden(globalThis.URL); // Absent only on XSnap
  harden(globalThis.Base64); // Present only on XSnap
};
