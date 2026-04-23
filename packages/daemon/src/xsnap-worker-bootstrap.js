// @ts-nocheck
/* global globalThis */

// Bootstrap script that runs *inside* the xsnap engine for the
// `xsnap-worker` daemon formula type.
//
// The worker is the persistence boundary: when xsnap is suspended, the host
// snapshots the entire heap to disk; when revived, every value still
// reachable from the globals here is restored. There is intentionally no
// durable zone — guests do not opt objects into durability, and there is no
// upgrade-survivable storage layer separate from the snapshot. If a value is
// not reachable from a global at snapshot time, it is gone.
//
// On first boot, this file establishes the SES perimeter, opens the
// netstring CapTP channel to the daemon over xsnap's stdio extension fds,
// and exposes a `WorkerDaemonFacet`. On revival, the channel must be
// re-established by the daemon — pre-snapshot in-flight CapTP state cannot
// be replayed across host processes — but every guest object reachable from
// the worker's globals survives unchanged.
//
// This file is loaded via `xsnap <bootstrap.js>`. `globalThis` here is
// xsnap's, not Node's; modules and the SES shim must come from a bundle the
// host supplies. The wiring below is the contract the daemon expects.

import '@endo/init';

import { makePromiseKit } from '@endo/promise-kit';
import { main } from './worker.js';

const { promise: cancelled, reject: cancel } = makePromiseKit();

const installSignalHandling = () => {
  // xsnap delivers external interrupts via a host-defined hook; the host
  // calls `globalThis.handleCommand` for each message. We treat any
  // sentinel "terminate" command as a graceful cancel.
  const previous = globalThis.handleCommand;
  globalThis.handleCommand = message => {
    if (message === 'terminate') {
      cancel(new Error('terminate'));
      return undefined;
    }
    if (typeof previous === 'function') {
      return previous(message);
    }
    return undefined;
  };
};

installSignalHandling();

// Stdio fds 3 and 4 carry the netstring CapTP frames, matching the
// Node-hosted worker's convention so the daemon-side wiring is symmetric.
// xsnap exposes these via its `os` module rather than Node's `fs`; the
// host-supplied build of xsnap is expected to provide a stream shim that
// presents reader/writer at those fds.
const { reader, writer } = globalThis.endoXsnapConnection || {};
if (!reader || !writer) {
  throw new Error(
    'xsnap-worker bootstrap requires globalThis.endoXsnapConnection to be set by the xsnap host build',
  );
}

const powers = harden({
  connection: { reader, writer },
  pathToFileURL: path => `file://${path}`,
});

main(powers, undefined, cancel, cancelled).catch(error => {
  console.error(error);
});
