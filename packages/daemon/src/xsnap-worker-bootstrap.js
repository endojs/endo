// @ts-nocheck
/* global globalThis */

// Bootstrap for the `xsnap-worker` daemon formula type.
//
// Runs *inside* the xsnap engine on first boot only. After the first
// snapshot, the daemon revives the worker from `heap.xss` and neither
// this file nor the preceding SES lockdown bundle is re-evaluated — the
// closures and `globalThis` mutations established here live in the
// snapshotted heap.
//
// Wire protocol (after @agoric/swingset-xsnap-supervisor's managerPort
// idiom):
//   - Every message is a tagged JSON array `[tag, ...args]`.
//   - host → worker: `vat.issueCommand(encode([tag, ...]))` delivered to
//     this file's `globalThis.handleCommand`.
//   - reply: `handleCommand` returns a `{ result }` report object and
//     fills in `report.result = encodedReplyBytes` when the async work
//     settles. xsnap drains the microtask queue until `report.result`
//     appears, then sends it as the `.`/OK reply.
//
// Replies are themselves tagged arrays:
//   `['ok', value]` — success, `value` is JSON-serializable
//   `['error', message]`
//   `['unserializable', message]` — the computed value couldn't be
//     JSON-encoded (e.g., a function or a captp-style remote that has no
//     wire form). The daemon can still refer to such values by vref in a
//     later request.
//
// The xsnap worker does **not** speak CapTP. Instead, values produced by
// guest code that cannot be returned by value are registered in the
// worker-local `exports` table under a stable vref string (e.g. `"o+3"`).
// The daemon treats vrefs as durable names for formula values. The
// snapshot captures the `exports` table, so after a restart the same
// vref still resolves to the same in-heap object. See
// docs/xsnap-worker.md for the broader design.

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const indirectEval = (0, eval); // eslint-disable-line no-eval

/** @param {unknown} item */
const encodeItem = item => encoder.encode(JSON.stringify(item)).buffer;

/** @param {Uint8Array | ArrayBuffer} bytes */
const decodeItem = bytes => JSON.parse(decoder.decode(new Uint8Array(bytes)));

// vref-indexed registry of values that can't travel by value. The map
// lives in the snapshotted heap; its entries survive revival. The daemon
// is the source of truth for durable formula↔vref bindings, so we only
// allocate a vref when asked.
const exportsByVref = new Map();
let nextExportId = 1;

/** @param {unknown} value */
const registerExport = value => {
  const vref = `o+${nextExportId}`;
  nextExportId += 1;
  exportsByVref.set(vref, value);
  return vref;
};

/** @param {string} vref */
const lookupExport = vref => {
  if (!exportsByVref.has(vref)) {
    throw new Error(`no export ${vref} in this worker`);
  }
  return exportsByVref.get(vref);
};

const canonicalize = value => {
  if (value === undefined) return null;
  try {
    // Round-trip through JSON to reject non-serializable values loudly.
    return JSON.parse(JSON.stringify(value));
  } catch (err) {
    throw new Error(`unserializable: ${(err && err.message) || err}`);
  }
};

/** @param {[string, ...unknown[]]} item */
const handleItem = async ([tag, ...args]) => {
  await null;
  switch (tag) {
    case 'eval': {
      const [source] = args;
      const value = await indirectEval(source);
      return ['ok', canonicalize(value)];
    }
    case 'evalAndExport': {
      // Evaluate; whatever it returns is stashed under a fresh vref so
      // the daemon can refer to it later even if its wire form would be
      // lossy (functions, closures, remotable exos).
      const [source] = args;
      const value = await indirectEval(source);
      const vref = registerExport(value);
      return ['ok', vref];
    }
    case 'invoke': {
      // Call a previously-exported value as a function with the given
      // JSON-safe arguments.
      const [vref, argv = []] = args;
      const fn = lookupExport(vref);
      if (typeof fn !== 'function') {
        throw new Error(`export ${vref} is not callable`);
      }
      const value = await fn(...argv);
      return ['ok', canonicalize(value)];
    }
    case 'release': {
      const [vref] = args;
      exportsByVref.delete(vref);
      return ['ok', null];
    }
    default:
      return ['error', `unknown tag: ${tag}`];
  }
};

globalThis.handleCommand = frame => {
  // xsnap's async-reply idiom: returning an object whose `.result`
  // property is filled in later causes xsnap to drain microtasks until
  // `.result` becomes an ArrayBuffer, then send that as the OK reply.
  const report = {};
  let item;
  try {
    item = decodeItem(frame);
    if (!Array.isArray(item) || item.length === 0) {
      throw new Error('expected a non-empty tagged array');
    }
  } catch (parseErr) {
    report.result = encodeItem(['error', `bad request: ${parseErr.message}`]);
    return report;
  }
  handleItem(/** @type {[string, ...unknown[]]} */ (item))
    .then(reply => {
      report.result = encodeItem(reply);
    })
    .catch(err => {
      report.result = encodeItem([
        'error',
        String((err && err.message) || err),
      ]);
    });
  return report;
};
