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
//
//   Every message is a tagged JSON array `[tag, ...args]` encoded as
//   UTF-8. Host → worker: `vat.issueCommand(encode([tag, ...]))`. The
//   reply rides back on xsnap's async-reply idiom: `handleCommand`
//   returns a report object and fills in `report.result` with the
//   encoded reply when the async work settles; xsnap drains microtasks
//   until `.result` is an ArrayBuffer.
//
//   Requests:
//     ['eval', source, endowments?]         evaluate source, optionally
//                                           with named endowments. Each
//                                           endowment value is a vref
//                                           that resolves to an entry
//                                           in the worker's export
//                                           table. This is how the
//                                           daemon feeds one formula's
//                                           result into another: if
//                                           B's source just returns
//                                           the endowment, the worker
//                                           sees the same JS value as
//                                           before and its vref is
//                                           deduped through the
//                                           WeakMap, so the daemon
//                                           gets back the same vref
//                                           and therefore the same
//                                           presence.
//     ['applyMethod', vref, prop, args]     vref[prop](...args)
//     ['applyFunction', vref, args]         vref(...args)
//     ['release', vref]                     drop export
//
//   Replies:
//     ['value', v]    JSON-safe value
//     ['ref', vref]   opaque handle into this worker's export table
//     ['error', msg]
//
// Return-value marshaling: any result that isn't plain JSON (closures,
// hardened exos, anything with identity) is transparently registered
// in a worker-local `exports` table and returned as `['ref', vref]`.
// The daemon-side bridge wraps those vrefs in handled-promise presences
// so the host can drive them with `E(obj).method()` just like any
// other remote. Args must currently be JSON-safe; marshaling vrefs
// through arguments would require symmetric capdata wiring.

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const indirectEval = (0, eval); // eslint-disable-line no-eval

/** @param {unknown} item */
const encodeItem = item => encoder.encode(JSON.stringify(item)).buffer;

/** @param {Uint8Array | ArrayBuffer} bytes */
const decodeItem = bytes => JSON.parse(decoder.decode(new Uint8Array(bytes)));

// vref-indexed registry of values that can't travel by value. The map
// lives in the snapshotted heap; its entries survive revival. The
// daemon is the source of truth for durable formula↔vref bindings.
const exportsByVref = new Map();
const vrefByValue = new WeakMap();
let nextExportId = 1;

/** @param {unknown} value */
const registerExport = value => {
  // A given value gets a stable vref within a worker lifetime; repeat
  // exports return the same string. Critically this means two
  // `evalAndExport` of the same closure produce the same vref, which
  // the daemon can use to dedup durable references.
  if (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function')
  ) {
    const existing = vrefByValue.get(value);
    if (existing !== undefined) return existing;
  }
  const vref = `o+${nextExportId}`;
  nextExportId += 1;
  exportsByVref.set(vref, value);
  if (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function')
  ) {
    vrefByValue.set(value, vref);
  }
  return vref;
};

/** @param {string} vref */
const lookupExport = vref => {
  if (!exportsByVref.has(vref)) {
    throw new Error(`no export ${vref} in this worker`);
  }
  return exportsByVref.get(vref);
};

/**
 * Is `value` losslessly representable as JSON data — ordinary plain
 * objects and arrays of primitives, with no function or symbol members
 * anywhere in the tree? Hardened exos, closures, Maps, etc. fail this
 * check and are exported by reference instead.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
const isPlainData = value => {
  if (value === null) return true;
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean') return true;
  if (t === 'bigint' || t === 'function' || t === 'symbol') return false;
  if (t !== 'object') return false;
  if (Array.isArray(value)) return value.every(isPlainData);
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;
  // Object.values only walks own enumerable string-keyed properties,
  // which is what JSON.stringify would emit. Symbol-keyed entries are
  // implicitly excluded.
  return Object.values(value).every(isPlainData);
};

/**
 * Encode a result either by value (for plain JSON data) or as a
 * freshly-allocated `['ref', vref]` for anything else — hardened exos,
 * closures, and anything JSON.stringify would lossily drop function
 * members from.
 *
 * @param {unknown} value
 * @returns {['value', unknown] | ['ref', string]}
 */
const marshalResult = value => {
  if (value === undefined) return ['value', null];
  if (isPlainData(value)) return ['value', value];
  return ['ref', registerExport(value)];
};

/** @param {[string, ...unknown[]]} item */
const handleItem = async ([tag, ...args]) => {
  await null;
  switch (tag) {
    case 'eval': {
      const [source, endowments = {}] = args;
      const names = Object.keys(endowments);
      let value;
      if (names.length === 0) {
        value = await indirectEval(source);
      } else {
        // Wrap the source in an arrow whose parameters receive the
        // resolved endowment values, then invoke. Indirect-eval'd in
        // the start compartment so the names available are the globals
        // plus our parameters. Note this means the source should be an
        // expression, not a statement list — consistent with the
        // plain `['eval', source]` case.
        const wrapperSrc = `((${names.join(', ')}) => (${source}))`;
        const fn = indirectEval(wrapperSrc);
        const values = names.map(n => lookupExport(endowments[n]));
        value = await fn(...values);
      }
      return marshalResult(value);
    }
    case 'applyMethod': {
      const [vref, prop, argv = []] = args;
      const target = lookupExport(vref);
      if (prop === null || prop === undefined) {
        // applyMethod(prop=null) in captp means "apply as function" —
        // we split those onto separate tags, so reject here.
        throw new Error(`applyMethod requires a property name`);
      }
      const method = target[prop];
      if (typeof method !== 'function') {
        throw new Error(`export ${vref} has no method ${String(prop)}`);
      }
      const value = await method.apply(target, argv);
      return marshalResult(value);
    }
    case 'applyFunction': {
      const [vref, argv = []] = args;
      const fn = lookupExport(vref);
      if (typeof fn !== 'function') {
        throw new Error(`export ${vref} is not callable`);
      }
      const value = await fn(...argv);
      return marshalResult(value);
    }
    case 'release': {
      const [vref] = args;
      const value = exportsByVref.get(vref);
      exportsByVref.delete(vref);
      if (value !== null && typeof value === 'object') {
        vrefByValue.delete(value);
      }
      return ['value', null];
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
