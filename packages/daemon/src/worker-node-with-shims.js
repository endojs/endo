// @ts-check
/* global process, repairIntrinsics, hardenIntrinsics */

// Phase 1: Import SES to get the split lockdown API on globalThis.
// `import 'ses'` makes repairIntrinsics/hardenIntrinsics available
// but does NOT call them.
import 'ses';
import '@endo/eventual-send/shim.js';

// Phase 2: Repair intrinsics (removes non-whitelisted properties,
// makes intrinsics safe) but do NOT freeze them yet.
repairIntrinsics({
  domainTaming: 'unsafe',
});

// Phase 3: Import trusted shims. They run after repair (non-whitelisted
// properties already removed) but before harden (intrinsics still mutable).
// This lets shims like reflect-metadata add methods to Reflect.
const shimsJson = process.argv[2];
if (shimsJson) {
  const shims = JSON.parse(shimsJson);
  for (const shim of shims) {
    // eslint-disable-next-line no-await-in-loop
    await import(shim);
  }
}

// Phase 4: Freeze all intrinsics, including any properties added by shims.
hardenIntrinsics();

// Post-lockdown setup matching @endo/lockdown/post.js
Error.stackTraceLimit = Infinity;
harden(globalThis.TextEncoder);
harden(globalThis.TextDecoder);
harden(globalThis.URL);

// Phase 5: Dynamic imports so they execute after lockdown.
const [{ makePowers }, { main }, fs, url, { makePromiseKit }] =
  await Promise.all([
    import('./worker-node-powers.js'),
    import('./worker.js'),
    import('fs'),
    import('url'),
    import('@endo/promise-kit'),
  ]);

/** @import { PromiseKit } from '@endo/promise-kit' */

const powers = makePowers({ fs: fs.default ?? fs, url: url.default ?? url });

const { promise: cancelled, reject: cancel } =
  /** @type {PromiseKit<never>} */ (makePromiseKit());

process.once('SIGINT', () => cancel(new Error('SIGINT')));

// @ts-ignore Yes, we can assign to exitCode, typedoc.
process.exitCode = 1;
main(powers, process.pid, cancel, cancelled).then(
  () => {
    process.exitCode = 0;
  },
  error => {
    console.error(error);
  },
);
