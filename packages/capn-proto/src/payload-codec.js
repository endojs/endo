// @ts-check
/**
 * Payload codec for Call/Return parameters.
 *
 * Cap'n Proto encodes parameters as `Payload { content :AnyPointer, capTable :List(CapDescriptor) }`.
 * Application schemas would point `content` at a typed struct. Without
 * compiling a schema for every interface our users define, we encode the
 * argument list using a pragmatic in-band serialization:
 *
 *   - The Payload.content is a Cap'n Proto Data field carrying a UTF-8 JSON
 *     blob describing the argument values.
 *   - Capability-bearing positions in the JSON are placeholder strings of
 *     the form `"@cap:N"` referring to index N of the Payload.capTable.
 *   - Promise-bearing positions are `"@promise:N"` with the same convention.
 *   - Special markers wrap BigInt as `"@bigint:..."` and Uint8Array as
 *     `"@bytes:base64"` so JSON round-trips preserve those types.
 *
 * This is a wire-compatible Payload at the Cap'n Proto level (Data + cap
 * table); the JSON convention inside Data is a private contract between
 * peers running this implementation, analogous to how `@endo/captp` uses
 * `@qclass` markers in its capdata. Applications that compile their own
 * Cap'n Proto schemas can bypass this codec by writing their own Payload via
 * the wire helpers.
 */

import { Fail } from '@endo/errors';

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder('utf-8');

/**
 * @typedef {object} CapDescriptor
 * @property {string} kind 'none' | 'senderHosted' | 'senderPromise' | 'receiverHosted' | 'receiverAnswer' | 'thirdPartyHosted'
 * @property {number} [id]
 * @property {number} [questionId]
 * @property {Array<{op: string, fieldOrdinal?: number}>} [transform]
 * @property {number} [vineId]
 * @property {Uint8Array} [thirdPartyCapId]
 */

const PROMISE_TAG = '@promise:';
const CAP_TAG = '@cap:';
const BIGINT_TAG = '@bigint:';
const BYTES_TAG = '@bytes:';

const toBase64 = bytes => {
  // Assume Node-compatible Buffer or browser btoa.
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  // eslint-disable-next-line no-undef
  return btoa(bin);
};
const fromBase64 = s => {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(s, 'base64'));
  }
  // eslint-disable-next-line no-undef
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
};

/**
 * Encode an argument value tree to Payload.
 *
 * @param {unknown} value
 * @param {{
 *   exportCap(value: unknown): { kind: string, id?: number, questionId?: number, transform?: any[] },
 *   isCap?(value: unknown): boolean,
 * }} ctx
 * @returns {{ contentBytes: Uint8Array, capTable: CapDescriptor[] }}
 */
export const encodePayload = (value, ctx) => {
  /** @type {CapDescriptor[]} */
  const capTable = [];
  const seen = new WeakMap();

  const replace = v => {
    if (v === null || v === undefined) return v;
    const t = typeof v;
    if (t === 'number' || t === 'string' || t === 'boolean') return v;
    if (t === 'bigint') return `${BIGINT_TAG}${v.toString()}`;
    if (v instanceof Uint8Array) return `${BYTES_TAG}${toBase64(v)}`;
    if (Array.isArray(v)) return v.map(replace);
    // Detect Promise.
    if (typeof v.then === 'function') {
      if (seen.has(v)) return seen.get(v);
      const desc = ctx.exportCap(v);
      const idx = capTable.length;
      capTable.push(desc);
      const marker = `${PROMISE_TAG}${idx}`;
      seen.set(v, marker);
      return marker;
    }
    if (t === 'object') {
      // Treat anything the connection identifies as a capability as such.
      // Otherwise use prototype to decide between plain record and remote
      // cap. Frozen plain objects (proto === Object.prototype || null) are
      // pass-by-copy. Anything with a non-trivial proto chain is a cap.
      const isCap = ctx.isCap ? ctx.isCap(v) : false;
      if (!isCap) {
        const proto = Object.getPrototypeOf(v);
        if (proto === Object.prototype) {
          const out = {};
          for (const [k, sub] of Object.entries(v)) out[k] = replace(sub);
          return out;
        }
      }
      if (seen.has(v)) return seen.get(v);
      const desc = ctx.exportCap(v);
      const idx = capTable.length;
      capTable.push(desc);
      const marker = `${CAP_TAG}${idx}`;
      seen.set(v, marker);
      return marker;
    }
    throw Fail`unencodable value of type ${t}`;
  };

  const replaced = replace(value);
  const json = JSON.stringify(replaced);
  return { contentBytes: utf8Encoder.encode(json), capTable };
};

/**
 * Decode a Payload back into a JS value tree, replacing capability markers
 * with imported presences/promises.
 *
 * @param {{ contentBytes: Uint8Array, capTable: CapDescriptor[] }} payload
 * @param {{ importCap(desc: CapDescriptor, idx: number): unknown }} ctx
 */
export const decodePayload = (payload, ctx) => {
  const text = utf8Decoder.decode(payload.contentBytes);
  if (text.length === 0) return undefined;
  const parsed = JSON.parse(text);
  const imported = payload.capTable.map((d, i) => ctx.importCap(d, i));
  const restore = v => {
    if (v === null || v === undefined) return v;
    if (typeof v === 'string') {
      if (v.startsWith(CAP_TAG)) return imported[Number(v.slice(CAP_TAG.length))];
      if (v.startsWith(PROMISE_TAG))
        return imported[Number(v.slice(PROMISE_TAG.length))];
      if (v.startsWith(BIGINT_TAG)) return BigInt(v.slice(BIGINT_TAG.length));
      if (v.startsWith(BYTES_TAG)) return fromBase64(v.slice(BYTES_TAG.length));
      return v;
    }
    if (Array.isArray(v)) return v.map(restore);
    if (typeof v === 'object') {
      const out = {};
      for (const [k, sub] of Object.entries(v)) out[k] = restore(sub);
      return out;
    }
    return v;
  };
  return restore(parsed);
};
