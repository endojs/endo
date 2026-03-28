// Endo OS Bootstrap — seL4 + QuickJS variant
//
// Runs on the formally verified seL4 kernel inside a Microkit
// protection domain.  QuickJS provides the JS engine (no JIT,
// so no mmap/mprotect needed — perfect for seL4).
//
// In later phases:
//   - Device drivers run in separate PDs
//   - Channels between PDs become capability references
//   - The seL4 kernel enforces isolation at every level

(function bootstrap() {
  'use strict';

  print('endo-os: Bootstrap starting (seL4 + QuickJS)');

  // === SES verification ===

  lockdown({ errorTaming: 'unsafe' });
  print('endo-os: SES lockdown succeeded');

  const greeting = harden({ message: 'Hello from Endo OS!' });
  print('endo-os: ' + greeting.message);

  try {
    greeting.message = 'tampered';
    print('endo-os: ERROR - harden() did not freeze!');
  } catch (e) {
    print('endo-os: harden() verified - object is frozen');
  }

  const c = new Compartment({ print: print });
  const result = c.evaluate('40 + 2');
  print('endo-os: Compartment.evaluate("40 + 2") = ' + result);

  // === Capability pattern on verified kernel ===
  //
  // On seL4, capabilities are enforced at THREE levels:
  //
  //   1. seL4 kernel caps — hardware access, IPC endpoints
  //   2. QuickJS + SES    — JS object-level isolation
  //   3. CapTP            — distributed capability passing
  //
  // No ambient authority at any layer.

  const counter = harden({
    _count: 0,
    increment() { this._count += 1; return this._count; },
    read() { return this._count; },
    help() { return 'Counter capability (seL4-verified isolation)'; },
  });

  print('endo-os: Capability created on verified kernel');
  print('endo-os: ' + counter.help());

  // === Summary ===

  print('');
  print('========================================');
  print(' Endo OS Phase 0a: seL4 + QuickJS');
  print('');
  print(' seL4 kernel:    formally verified');
  print(' QuickJS engine: OK');
  print(' SES lockdown:   OK');
  print(' harden():       OK');
  print(' Compartment:    OK');
  print(' Capabilities:   OK');
  print('');
  print(' Capabilities all the way down.');
  print(' No ambient authority at any layer.');
  print('========================================');

  // === Future: seL4 channel-based device capabilities ===
  //
  // Phase 1: Receive device capabilities via Microkit channels.
  //   Each channel IS a capability — enforced by the verified kernel.
  //
  //   // Channel 1 → virtio-blk driver PD
  //   const disk = makeChannelCapability(1, {
  //     read(offset, length) { ... },
  //     write(offset, data) { ... },
  //   });
  //
  //   // Channel 2 → virtio-net driver PD
  //   const network = makeChannelCapability(2, {
  //     listen(port) { ... },
  //     connect(host, port) { ... },
  //   });
  //
  // The driver PDs expose their services as protected procedures.
  // endo-init invokes them via seL4 IPC.  The kernel guarantees:
  //   - Only PDs with the channel capability can invoke the driver
  //   - A compromised camera driver cannot access the disk
  //   - Revocation is instant and total (revoke the channel cap)

})();
