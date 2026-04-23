// @ts-nocheck
/* global globalThis, issueCommand */

// Transport bootstrap for the `xsnap-worker` daemon formula type.
//
// This file is evaluated *inside* the xsnap engine on first boot only. It
// runs in xsnap's runtime — not Node — so it must not use Node modules,
// dynamic import, or the SES shim until those are loaded by a separate
// bundle (see ENDO_XSNAP_WORKER_BUNDLE below).
//
// The daemon communicates with the worker via xsnap's native command
// protocol:
//   - daemon → worker: xsnap calls `globalThis.handleCommand(bytes)` once
//     per message, expecting a Uint8Array reply.
//   - worker → daemon: the worker calls the host-provided `issueCommand`
//     global. The daemon receives each call via the `handleCommand` it
//     registered when spawning xsnap.
//
// We wire both directions into async iterator adapters exposed on
// `globalThis.endoXsnapTransport` so that a later-evaluated, SES-framed
// worker bundle can ride {@link makeMessageCapTP} on top. Each message is a
// pre-framed CapTP payload serialized as JSON; no netstring framing is
// applied on top of xsnap's own message protocol.
//
// Persistence: once the worker bundle has established CapTP over this
// transport, the complete state — queues, closures, CapTP tables — lives in
// the xsnap heap and is captured by the daemon's snapshot on shutdown. On
// revival, the snapshot restores everything and no bootstrap re-evaluation
// is required. There is intentionally no durable zone; values not reachable
// from globals at snapshot time are gone.

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const makeQueue = () => {
  const items = [];
  const waiters = [];
  let closed = false;
  return {
    push(item) {
      if (closed) return;
      if (waiters.length > 0) {
        const w = waiters.shift();
        w.resolve({ value: item, done: false });
      } else {
        items.push(item);
      }
    },
    close() {
      closed = true;
      for (const w of waiters.splice(0)) {
        w.resolve({ value: undefined, done: true });
      }
    },
    pull() {
      if (items.length > 0) {
        return Promise.resolve({ value: items.shift(), done: false });
      }
      if (closed) {
        return Promise.resolve({ value: undefined, done: true });
      }
      const w = deferred();
      waiters.push(w);
      return w.promise;
    },
  };
};

const inbox = makeQueue();

globalThis.handleCommand = frame => {
  const bytes = new Uint8Array(frame);
  const text = textDecoder.decode(bytes);
  const message = JSON.parse(text);
  inbox.push(message);
  return new Uint8Array(0);
};

const outgoingWriter = {
  next(message) {
    const text = JSON.stringify(message);
    const bytes = textEncoder.encode(text);
    issueCommand(bytes);
    return Promise.resolve({ value: undefined, done: false });
  },
  return() {
    return Promise.resolve({ value: undefined, done: true });
  },
  throw(error) {
    return Promise.reject(error);
  },
  [Symbol.asyncIterator]() {
    return this;
  },
};

const incomingReader = {
  next() {
    return inbox.pull();
  },
  return() {
    inbox.close();
    return Promise.resolve({ value: undefined, done: true });
  },
  throw(error) {
    inbox.close();
    return Promise.reject(error);
  },
  [Symbol.asyncIterator]() {
    return this;
  },
};

// The daemon's first-boot handshake evaluates this file, then evaluates a
// SES-framed worker bundle that picks up `endoXsnapTransport` and installs a
// `WorkerDaemonFacet` over CapTP. After the snapshot is taken, neither is
// re-evaluated; the revived heap already contains the running worker.
globalThis.endoXsnapTransport = Object.freeze({
  reader: incomingReader,
  writer: outgoingWriter,
});
