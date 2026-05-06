/* global globalThis */
// WHATWG Streams ⇄ Cap'n Web bridge.
//
// On the SENDER side:
//   - A user-supplied `WritableStream` is exported as a Far'd "remote
//     writer" object whose methods (write, close, abort) delegate to the
//     stream's writer.  The wire form is `["writable", -id]`.
//   - A user-supplied `ReadableStream` is exported similarly with a
//     read/cancel API.  Wire form: `["readable", -id]`.
//
// On the RECEIVER side:
//   - `["writable", id]` is decoded into a real WritableStream whose
//     underlying sink forwards write/close/abort over E() to the remote
//     writer object.
//   - `["readable", id]` is decoded into a real ReadableStream whose
//     underlying source pulls chunks via remote read() calls.
//
// We use plain remote method calls (push / pull) rather than the
// non-spec `["pipe"]` / `["readable"]` / `["writable"]` ad-hoc plumbing,
// so this works against any conforming peer that supports object-by-
// reference exports.  The trade-off is one round-trip per chunk; chunked
// streaming over a single HTTP request batch is not feasible.

import harden from '@endo/harden';
import { makeExo } from '@endo/exo';
import { E } from '@endo/eventual-send';

const G = /** @type {any} */ (globalThis);

export const haveWebStreams =
  typeof G.WritableStream === 'function' &&
  typeof G.ReadableStream === 'function';

export const haveTransformStream =
  haveWebStreams && typeof G.TransformStream === 'function';

export const makeTransformStream = () => new G.TransformStream();

/**
 * Pre-patch a Node WHATWG-stream instance so that `harden`-ing it later
 * doesn't break subsequent internal slot writes.
 *
 * Node stores stream state in a hidden `Symbol(kState)`-keyed own
 * property whose top-level slots (`reader`, `writer`, `controller`,
 * `closeRequested`, etc.) get mutated on each user-facing operation
 * (`getReader`, `write`, `close`, `abort`, …).  Once the instance is
 * frozen by `@endo/harden`, those mutations throw with
 * "Cannot assign to read only property '<slot>' of object '[object
 * Object]'", and any stream that crosses an `@endo/pass-style`
 * boundary (Far/exo method args/returns) gets hardened that way.
 *
 * Converting each `kState` slot into an accessor pair backed by
 * closure storage achieves two things at once:
 *  1. Subsequent `state.<slot> = …` writes hit the setter and mutate
 *     the closure value, so freeze can't block them.
 *  2. `harden`'s graph walk stops at the accessor boundary — it
 *     freezes the descriptor pair but doesn't recurse through the
 *     get/set return values, so the controller and other nested
 *     state objects also stay un-frozen.
 *
 * See https://github.com/endojs/endo/issues/3244 (filed while
 * investigating; the long-term fix belongs at the SES layer).
 *
 * Caveats:
 * - The "hardened" stream isn't truly immutable — internal mutations
 *   still happen via the closure-backed setters.  Acceptable for
 *   in-package plumbing; **not** safe to expose to untrusted code
 *   that relies on harden's invariants.
 * - Tied to Node's current internal naming (`Symbol(kState)`).  A
 *   future engine refactor that moves state into class private
 *   fields silently breaks this — the no-op early-return covers
 *   that case.
 *
 * @param {object} stream
 */
export const patchStreamForHarden = stream => {
  if (stream === null || typeof stream !== 'object') return;
  const kState = Object.getOwnPropertySymbols(stream).find(
    sym => sym.description === 'kState',
  );
  if (!kState) return;
  const state = /** @type {any} */ (stream)[kState];
  if (state === null || typeof state !== 'object') return;
  for (const k of Object.keys(state)) {
    const desc = Object.getOwnPropertyDescriptor(state, k);
    if (desc && desc.writable && desc.configurable) {
      let v = desc.value;
      Object.defineProperty(state, k, {
        configurable: true,
        enumerable: desc.enumerable,
        get() {
          return v;
        },
        set(nv) {
          v = nv;
        },
      });
    }
  }
};

/**
 * Wrap a JS WritableStream so it can be sent over the wire as a Far'd
 * write-end.  The underlying stream's writer is locked eagerly at export
 * time — concurrent calls from the peer can't race a lazy `getWriter`.
 *
 * @param {WritableStream} ws
 */
export const exportWritableStream = ws => {
  /** @type {any} */
  const writer = ws.getWriter();
  return makeExo('writable', undefined, {
    write: async chunk => {
      await writer.write(chunk);
    },
    close: async () => {
      await writer.close();
    },
    abort: async reason => {
      await writer.abort(reason);
    },
  });
};

/**
 * Wrap a JS ReadableStream so it can be sent over the wire as a Far'd
 * read-end with `read()` and `cancel()` methods.  The reader is locked
 * eagerly at export time so concurrent peer calls can't race.
 *
 * @param {ReadableStream} rs
 */
export const exportReadableStream = rs => {
  /** @type {any} */
  const reader = rs.getReader();
  return makeExo('readable', undefined, {
    read: async () => {
      const { value, done } = await reader.read();
      return harden({ value, done });
    },
    cancel: async reason => {
      await reader.cancel(reason);
    },
  });
};

/**
 * Synthesise a real WritableStream from a remote writer presence.  Each
 * `controller.write(chunk)` call sends an `E(stub).write(chunk)` and waits
 * for the answer.
 *
 * @param {object} stub  A presence stub returned by the evaluator for a
 *   peer's WritableStream.
 */
export const importWritableStream = stub => {
  if (!haveWebStreams) {
    // Fall through: caller can use E(stub).write/close/abort directly.
    return stub;
  }
  return new G.WritableStream({
    write(chunk) {
      return E(stub).write(chunk);
    },
    close() {
      return E(stub).close();
    },
    abort(reason) {
      return E(stub).abort(reason);
    },
  });
};

/**
 * Synthesise a real ReadableStream from a remote reader presence.  Each
 * `controller.pull` triggers `E(stub).read()`.
 *
 * @param {object} stub
 */
export const importReadableStream = stub => {
  if (!haveWebStreams) {
    return stub;
  }
  return new G.ReadableStream({
    async pull(controller) {
      const { value, done } = /** @type {any} */ (await E(stub).read());
      if (done) {
        controller.close();
      } else {
        controller.enqueue(value);
      }
    },
    cancel(reason) {
      return E(stub).cancel(reason);
    },
  });
};

harden(exportWritableStream);
harden(exportReadableStream);
harden(importWritableStream);
harden(importReadableStream);
