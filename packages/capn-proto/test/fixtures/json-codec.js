// @ts-nocheck
/**
 * Test-only generic methodCodec.
 *
 * Encodes JS args/results as a JSON UTF-8 blob in a Data list at the
 * AnyPointer slot, plus a side-band capTable for capabilities. Lets
 * protocol-level tests (embargo, gc, lifecycle, three-party) drive
 * arbitrary `E(presence).method(args)` traffic without designing a real
 * .capnp schema for every test.
 *
 * NOT CF-INTEROP. This fixture lives only in test/ and is never imported
 * by src/. Real applications use `loadSchema(...).registerInterface()`,
 * which produces byte-compatible struct content at the AnyPointer slot.
 *
 * The marker convention mirrors what the deleted JSON-payload codec used:
 *   {"@cap": N}     → capTable[N]
 *   {"@bigint": "…"} → BigInt
 *   {"@bytes": "…"}  → Uint8Array (base64)
 */

import { writeData, readData } from '../../src/wire/text.js';

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder();

const isCap = v => {
  if (v == null) return false;
  const t = typeof v;
  if (t !== 'object' && t !== 'function') return false;
  if (typeof (/** @type {any} */ (v).then) === 'function') return true;
  const proto = Object.getPrototypeOf(v);
  return proto !== Object.prototype && proto !== Array.prototype;
};

const u8ToBase64 = u8 => {
  let s = '';
  for (let i = 0; i < u8.length; i += 1) s += String.fromCharCode(u8[i]);
  return btoa(s);
};
const base64ToU8 = b => {
  const s = atob(b);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) u8[i] = s.charCodeAt(i);
  return u8;
};

const replaceForJSON = (capTable, exportCap, value) => {
  if (typeof value === 'bigint') return { '@bigint': value.toString() };
  if (value instanceof Uint8Array) return { '@bytes': u8ToBase64(value) };
  if (Array.isArray(value)) {
    return value.map(v => replaceForJSON(capTable, exportCap, v));
  }
  if (isCap(value)) {
    const idx = capTable.length;
    capTable.push(exportCap ? exportCap(value) : { kind: 'unknown' });
    return { '@cap': idx };
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = replaceForJSON(capTable, exportCap, v);
    }
    return out;
  }
  return value;
};

const reviveFromJSON = (capTable, importCap, value) => {
  if (Array.isArray(value)) {
    return value.map(v => reviveFromJSON(capTable, importCap, v));
  }
  if (value && typeof value === 'object') {
    if ('@cap' in value) {
      const desc = capTable[value['@cap']];
      return importCap ? importCap(desc) : desc;
    }
    if ('@bigint' in value) return BigInt(value['@bigint']);
    if ('@bytes' in value) return base64ToU8(value['@bytes']);
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = reviveFromJSON(capTable, importCap, v);
    }
    return out;
  }
  return value;
};

const encodeJsonContent = (capTable, exportCap, value) => {
  const json = JSON.stringify(replaceForJSON(capTable, exportCap, value));
  const bytes = utf8Encoder.encode(json);
  return (msg, slot) => writeData(msg, slot, bytes);
};

const decodeJsonContent = (payload, importCap) => {
  const slot = payload.contentSlot;
  if (!slot) return undefined;
  const bytes = readData(slot.msg, slot.segId, slot.wordOffset);
  if (!bytes || bytes.length === 0) return undefined;
  return reviveFromJSON(
    payload.capTable || [],
    importCap,
    JSON.parse(utf8Decoder.decode(bytes)),
  );
};

/** A single method's request+response codec, both JSON-shaped. */
export const makeJsonMethodCodec = () => ({
  request: {
    encode: (args, ctx) => {
      const capTable = [];
      return {
        encodeContent: encodeJsonContent(capTable, ctx?.exportCap, args),
        capTable,
      };
    },
    decode: (payload, ctx) => {
      const args = decodeJsonContent(payload, ctx?.importCap);
      return Array.isArray(args) ? args : [];
    },
  },
  response: {
    encode: (value, ctx) => {
      const capTable = [];
      return {
        encodeContent: encodeJsonContent(capTable, ctx?.exportCap, value),
        capTable,
      };
    },
    decode: (payload, ctx) => decodeJsonContent(payload, ctx?.importCap),
  },
});

/**
 * Build a `methodCodecs` map covering every method in `methods`. Each
 * method gets the same JSON-shaped codec.
 *
 * @param {Record<string, number>} methods
 * @returns {Record<string, { request: any, response: any }>}
 */
export const jsonCodecsFor = methods => {
  /** @type {Record<string, { request: any, response: any }>} */
  const out = {};
  for (const name of Object.keys(methods)) {
    out[name] = makeJsonMethodCodec();
  }
  return out;
};

/**
 * Convenience: builds an InterfaceDescriptor with `methodCodecs` filled
 * in by `jsonCodecsFor`. Drop-in replacement for the existing
 * `{ id, methods }` literal in tests.
 *
 * @param {{ id: bigint, methods: Record<string, number> }} desc
 */
export const withJsonCodecs = desc => ({
  ...desc,
  methodCodecs: jsonCodecsFor(desc.methods),
});
