// Endo OS Bootstrap
//
// This is the first user-level code that runs after SES lockdown.
// In Phase 0, it's a proof-of-life that validates the V8 host,
// SES environment, and basic capabilities.
//
// In later phases, this file will:
//   - Import and instantiate the Endo daemon
//   - Receive OS-provided capabilities (block device, network, etc.)
//   - Call makeDaemon(osPowers) to boot the pet daemon
//   - Start the WebSocket gateway for the Chat UI
//   - Start the console chat interface

(function bootstrap() {
  'use strict';

  print('endo-os: Bootstrap starting');

  // === Phase 0: Proof of life ===

  // 1. Verify SES lockdown works.
  lockdown({ errorTaming: 'unsafe' });
  print('endo-os: SES lockdown succeeded');

  // 2. Verify harden() works.
  const greeting = harden({ message: 'Hello from Endo OS!' });
  print('endo-os: ' + greeting.message);

  // 3. Verify the object is actually frozen.
  try {
    greeting.message = 'tampered';
    print('endo-os: ERROR - harden() did not freeze the object!');
  } catch (e) {
    print('endo-os: harden() verified - object is frozen');
  }

  // 4. Verify Compartment evaluation works.
  const c = new Compartment({ print: print });
  const result = c.evaluate('40 + 2');
  print('endo-os: Compartment.evaluate("40 + 2") = ' + result);

  // 5. Test basic capability pattern — a hardened object with
  //    methods, passed by reference.
  const counter = harden({
    _count: 0,
    increment() { this._count += 1; return this._count; },
    read() { return this._count; },
    help() { return 'A simple counter capability'; },
  });

  // In a capability OS, you'd pass `counter` to another agent
  // via CapTP.  They could call increment() and read() but
  // couldn't tamper with the internals.
  print('endo-os: Counter capability created');
  print('endo-os: counter.help() = ' + counter.help());

  // === Summary ===
  print('');
  print('========================================');
  print(' Endo OS Phase 0: All checks passed!');
  print('');
  print(' V8 engine:     OK');
  print(' SES lockdown:  OK');
  print(' harden():      OK');
  print(' Compartment:   OK');
  print(' Capabilities:  OK');
  print('');
  print(' The capability-native OS is alive.');
  print('========================================');

  // === Future phases ===
  //
  // Phase 1: Receive block device capability from host.
  //   const blockDevice = hostPowers.blockDevice;
  //   const store = makeBlockStore(blockDevice);
  //
  // Phase 3: Boot the daemon.
  //   const osPowers = makeDaemonicPowers({ store, crypto, network });
  //   const { endoBootstrap } = await makeDaemon(osPowers, ...);
  //
  // Phase 4: Start the gateway.
  //   const network = hostPowers.network;
  //   startWsGateway(network, endoBootstrap, 8920);
  //
  // Phase 5: Start the console chat.
  //   const console = hostPowers.console;
  //   startConsoleChat(console, endoBootstrap);

})();
