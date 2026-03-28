// DaemonicPowers for seL4 — in-memory implementation.
//
// The daemon core (daemon.js) is platform-agnostic.  It receives
// all platform capabilities through the `powers` parameter of
// makeDaemon().  This file provides an in-memory implementation
// that works on seL4 without filesystem, network, or processes.
//
// Storage is in-memory (lost on reboot — persistence comes later
// when we add a block device driver PD).

(function setupDaemonPowers() {
  'use strict';

  // === In-memory storage ===

  const formulaStore = new Map();
  const contentStore = new Map();
  const petStores = new Map();

  // === CryptoPowers ===
  // Stubs — real crypto needs a seL4 driver or software impl.

  const cryptoPowers = harden({
    makeSha256() {
      let data = '';
      return harden({
        update(chunk) { data += String(chunk); },
        digestHex() {
          // Simple hash stub — not cryptographically secure.
          let h = 0;
          for (let i = 0; i < data.length; i++) {
            h = ((h << 5) - h + data.charCodeAt(i)) | 0;
          }
          return Math.abs(h).toString(16).padStart(16, '0');
        },
      });
    },
    randomHex512() {
      // Stub — needs real entropy source.
      let hex = '';
      for (let i = 0; i < 128; i++) {
        hex += Math.floor(Math.random() * 16).toString(16);
      }
      return hex;
    },
    makeEd25519Keypair() {
      return harden({
        publicKey: 'stub-public-key',
        privateKey: 'stub-private-key',
      });
    },
    signBytes(privateKey, bytes) {
      return 'stub-signature';
    },
  });

  // === FilePowers (in-memory) ===

  const filePowers = harden({
    readText(path) { return contentStore.get(path) || ''; },
    maybeReadText(path) { return contentStore.get(path); },
    writeText(path, text) { contentStore.set(path, text); },
    readDirectory(path) { return []; },
    makePath(path) { /* no-op in memory */ },
    removePath(path) { contentStore.delete(path); },
    joinPath(...parts) { return parts.join('/'); },
    isAccessible(path) { return contentStore.has(path); },
    isDirectory(path) { return false; },
    renamePath(from, to) {
      const v = contentStore.get(from);
      contentStore.set(to, v);
      contentStore.delete(from);
    },
    watchDirectory(path) { /* no-op */ },
  });

  // === DaemonicPersistencePowers (in-memory) ===

  let rootNonce = null;
  let rootKeypair = null;

  const persistencePowers = harden({
    initializePersistence() { /* no-op */ },
    provideRootNonce() {
      if (!rootNonce) rootNonce = cryptoPowers.randomHex512();
      return rootNonce;
    },
    provideRootKeypair() {
      if (!rootKeypair) rootKeypair = cryptoPowers.makeEd25519Keypair();
      return rootKeypair;
    },
    makeContentStore() {
      return harden({
        has(sha256) { return contentStore.has('content:' + sha256); },
        get(sha256) { return contentStore.get('content:' + sha256); },
        put(sha256, data) { contentStore.set('content:' + sha256, data); },
        remove(sha256) { contentStore.delete('content:' + sha256); },
      });
    },
    readFormula(id) {
      const json = formulaStore.get(id);
      return json ? JSON.parse(json) : undefined;
    },
    writeFormula(id, formula) {
      formulaStore.set(id, JSON.stringify(formula));
    },
    deleteFormula(id) {
      formulaStore.delete(id);
    },
    listFormulas() {
      return [...formulaStore.keys()];
    },
  });

  // === PetStorePowers (in-memory) ===

  const petStorePowers = harden({
    makePetStoreMaker() {
      return harden({
        make(id) {
          if (!petStores.has(id)) petStores.set(id, new Map());
          const store = petStores.get(id);
          return harden({
            get(name) { return store.get(name); },
            set(name, value) { store.set(name, value); },
            has(name) { return store.has(name); },
            remove(name) { store.delete(name); },
            list() { return [...store.keys()]; },
            entries() { return [...store.entries()]; },
          });
        },
      });
    },
  });

  // === DaemonicControlPowers (stub — no workers on seL4 yet) ===

  const controlPowers = harden({
    makeWorker(id, daemonWorkerFacet) {
      // On seL4, "workers" are Compartments in the same PD.
      // For now, return a stub that evaluates in-process.
      print('daemon: Worker requested (in-process stub on seL4)');
      return harden({
        terminate() {},
      });
    },
  });

  // === Assemble DaemonicPowers ===

  globalThis.__daemonicPowers = harden({
    crypto: cryptoPowers,
    filePowers: filePowers,
    persistence: persistencePowers,
    petStore: petStorePowers,
    control: controlPowers,
  });

  print('daemon-powers: In-memory DaemonicPowers ready (seL4)');
})();
