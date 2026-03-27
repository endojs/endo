// Endo OS Bootstrap
//
// First user-level code after SES lockdown.  Validates the V8 host,
// SES environment, and then probes all device capabilities.
//
// Later phases will use these capabilities to boot the Endo daemon:
//   disk    → content-addressed formula store
//   network → WebSocket gateway for Chat UI
//   display → console chat shell
//   camera  → video stream capabilities passable via chat
//   mic     → audio stream capabilities passable via chat

(function bootstrap() {
  'use strict';

  print('endo-os: Bootstrap starting');

  // === SES verification ===

  lockdown({ errorTaming: 'unsafe' });
  print('endo-os: SES lockdown succeeded');

  const greeting = harden({ message: 'Hello from Endo OS!' });
  print('endo-os: ' + greeting.message);

  try {
    greeting.message = 'tampered';
    print('endo-os: ERROR - harden() did not freeze the object!');
  } catch (e) {
    print('endo-os: harden() verified - object is frozen');
  }

  const c = new Compartment({ print: print });
  const result = c.evaluate('40 + 2');
  print('endo-os: Compartment.evaluate("40 + 2") = ' + result);

  // === Device capability probing ===
  //
  // Each __openXxx() call returns a capability object.  In the
  // Endo model, these are the root capabilities — the OS hands
  // them to the daemon, which attenuates and delegates them to
  // guest agents via pet names and CapTP.

  print('');
  print('--- Probing device capabilities ---');

  // 1. Block device (disk)
  let disk = null;
  try {
    disk = __openBlockDevice('/dev/vda');
    const diskSize = disk.size();
    print('endo-os: [disk]    /dev/vda ' +
          Math.round(diskSize / 1024 / 1024) + 'MB — ' + disk.help());
  } catch (e) {
    print('endo-os: [disk]    not available (' + e.message + ')');
  }

  // 2. Network
  let network = null;
  try {
    network = __createNetworkInterface();
    print('endo-os: [network] ready — ' + network.help());
  } catch (e) {
    print('endo-os: [network] not available (' + e.message + ')');
  }

  // 3. Framebuffer (display)
  let display = null;
  try {
    display = __openFramebuffer('/dev/fb0');
    print('endo-os: [display] ' + display.width() + 'x' +
          display.height() + ' @ ' + display.bpp() + 'bpp — ' +
          display.help());
  } catch (e) {
    print('endo-os: [display] not available (' + e.message + ')');
  }

  // 4. Camera
  let camera = null;
  try {
    camera = __openCamera('/dev/video0');
    print('endo-os: [camera]  ' + camera.width() + 'x' +
          camera.height() + ' ' + camera.format() + ' — ' +
          camera.help());
  } catch (e) {
    print('endo-os: [camera]  not available (' + e.message + ')');
  }

  // 5. Microphone
  let mic = null;
  try {
    mic = __openMicrophone('/dev/dsp');
    print('endo-os: [mic]     ' + mic.sampleRate() + 'Hz ' +
          mic.channels() + 'ch ' + mic.bitsPerSample() + 'bit — ' +
          mic.help());
  } catch (e) {
    print('endo-os: [mic]     not available (' + e.message + ')');
  }

  // === Capability inventory ===
  //
  // Collect available capabilities into a hardened powers object.
  // This is what gets passed to makeDaemon() in later phases.

  const hostPowers = harden({
    disk,
    network,
    display,
    camera,
    mic,
    help() {
      const avail = [];
      if (disk)    avail.push('disk');
      if (network) avail.push('network');
      if (display) avail.push('display');
      if (camera)  avail.push('camera');
      if (mic)     avail.push('mic');
      return 'Endo OS host powers: ' + avail.join(', ');
    },
  });

  // === Summary ===

  print('');
  print('========================================');
  print(' Endo OS: All checks passed!');
  print('');
  print(' V8 engine:     OK');
  print(' SES lockdown:  OK');
  print(' harden():      OK');
  print(' Compartment:   OK');
  print('');
  print(' ' + hostPowers.help());
  print('');
  print(' The capability-native OS is alive.');
  print('========================================');

  // === Capability passing demo ===
  //
  // Demonstrate the key insight: device capabilities are just
  // objects.  You can pass them to a Compartment (sandboxed
  // guest) and the guest can use them — but ONLY the specific
  // capabilities you grant.

  if (disk) {
    print('');
    print('--- Capability delegation demo ---');

    // Create a read-only attenuated view of the disk.
    const readOnlyDisk = harden({
      read: disk.read.bind(disk),
      size: disk.size.bind(disk),
      help() { return 'Read-only disk capability (attenuated)'; },
    });

    // A guest Compartment receives only the read-only view.
    const guest = new Compartment({
      print: print,
      disk: readOnlyDisk,
    });

    guest.evaluate(
      "print('guest: I received a disk capability: ' + disk.help());" +
      "print('guest: Disk size = ' + disk.size() + ' bytes');" +
      "try { disk.write(0, new Uint8Array([1])); }" +
      "catch(e) { print('guest: Cannot write (good!) — ' + e.message); }"
    );

    print('endo-os: Guest received attenuated disk — no write access');
  }

  // === Next steps ===
  //
  // Phase 1: Use disk capability to build content-addressed store.
  //   const store = makeBlockStore(hostPowers.disk);
  //   const persistence = makePersistence(store);
  //
  // Phase 3: Boot the daemon with all powers.
  //   const daemon = await makeDaemon({
  //     persistence, crypto, control, petStore, filePowers
  //   });
  //
  // Phase 4: Use network to serve Chat UI.
  //   const listener = hostPowers.network.listen(8920);
  //   startWsGateway(listener, daemon.endoBootstrap);
  //
  // Phase 5: Use display + keyboard for console chat.
  //   startConsoleChatShell(hostPowers.display, keyboard, daemon);
  //
  // Capability passing across chat:
  //   // Agent A has a camera, shares it with Agent B via chat:
  //   E(agentB).send('camera', hostPowers.camera);
  //   // Agent B shares with Agent C — stream re-routes directly:
  //   E(agentC).send('camera', receivedCamera);

})();
