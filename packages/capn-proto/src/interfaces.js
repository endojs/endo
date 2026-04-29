// @ts-check
/**
 * Per-interface ordinal map registry.
 *
 * Cap'n Proto identifies methods by `(interfaceId :UInt64, methodId :UInt16)`.
 * To send and receive calls we need a bidirectional mapping between method
 * names exposed in JS and these ordinals. Maps are registered explicitly per
 * interface — there is no name-derived heuristic.
 *
 * Usage:
 *
 *   registerInterface({
 *     id: 0xa1b2c3d4e5f60718n,
 *     methods: { hello: 0, goodbye: 1 },
 *   });
 *
 * The same registry is consulted on both sides of a connection, so both
 * peers must register matching maps for any interface they will speak.
 */

import { Fail, q } from '@endo/errors';

/**
 * @typedef {object} MethodCodec
 * @property {(jsObj: unknown) => Uint8Array | ArrayBuffer} encode
 * @property {(bytes: ArrayBuffer | Uint8Array) => unknown} decode
 */

/**
 * @typedef {object} InterfaceDescriptor
 * @property {bigint} id
 * @property {Record<string, number>} methods         method name → ordinal
 * @property {Record<number | string, { request?: MethodCodec, response?: MethodCodec }>} [methodCodecs]
 *   Optional per-method schema-typed codecs. Keys may be method ordinals
 *   (numbers) or method names (strings). When present, the payload codec
 *   uses these instead of the default JSON-over-bytes serialization for
 *   the matching direction. A method may register a request codec, a
 *   response codec, both, or neither.
 */

/**
 * @typedef {object} InterfaceRegistry
 * @property {(desc: InterfaceDescriptor) => void} register
 * @property {(interfaceId: bigint) => InterfaceDescriptor | undefined} byId
 * @property {(interfaceId: bigint, methodId: number) => string | undefined} methodName
 * @property {(interfaceId: bigint, methodName: string) => number | undefined} methodOrdinal
 * @property {(interfaceId: bigint) => boolean} has
 * @property {() => IterableIterator<InterfaceDescriptor>} iterate
 * @property {(interfaceId: bigint, methodId: number, dir: 'request' | 'response') => MethodCodec | undefined} methodCodec
 */

/** @returns {InterfaceRegistry} */
export const makeInterfaceRegistry = () => {
  /** @type {Map<bigint, InterfaceDescriptor>} */
  const byIdMap = new Map();
  /** @type {Map<bigint, Map<number, string>>} */
  const reverseByIface = new Map();
  /** @type {Map<bigint, Map<number, { request?: MethodCodec, response?: MethodCodec }>>} */
  const codecsByIface = new Map();

  const register = desc => {
    (desc && typeof desc === 'object') ||
      Fail`registerInterface requires a descriptor`;
    typeof desc.id === 'bigint' ||
      Fail`interface id must be bigint, got ${desc.id}`;
    (desc.methods && typeof desc.methods === 'object') ||
      Fail`interface ${desc.id} requires methods map`;
    const existing = byIdMap.get(desc.id);
    if (existing) {
      // Allow idempotent re-registration if maps match.
      const a = JSON.stringify(existing.methods);
      const b = JSON.stringify(desc.methods);
      a === b ||
        Fail`interface ${q(desc.id)} already registered with a different method map`;
      return;
    }
    /** @type {Map<number, string>} */
    const reverse = new Map();
    for (const [name, ord] of Object.entries(desc.methods)) {
      (typeof ord === 'number' &&
        Number.isInteger(ord) &&
        ord >= 0 &&
        ord < 0x10000) ||
        Fail`method ${q(name)} ordinal must be uint16, got ${ord}`;
      !reverse.has(ord) ||
        Fail`method ordinal ${ord} duplicated in interface ${q(desc.id)}`;
      reverse.set(ord, name);
    }
    byIdMap.set(desc.id, { id: desc.id, methods: { ...desc.methods } });
    reverseByIface.set(desc.id, reverse);
    if (desc.methodCodecs) {
      /** @type {Map<number, { request?: MethodCodec, response?: MethodCodec }>} */
      const codecs = new Map();
      for (const [k, v] of Object.entries(desc.methodCodecs)) {
        const ord = Number.isInteger(Number(k)) ? Number(k) : desc.methods[k];
        if (ord === undefined) {
          throw Fail`methodCodec key ${q(k)} does not name a known method`;
        }
        codecs.set(ord, v);
      }
      codecsByIface.set(desc.id, codecs);
    }
  };

  return {
    register,
    byId: id => byIdMap.get(id),
    has: id => byIdMap.has(id),
    methodName: (id, mid) => reverseByIface.get(id)?.get(mid),
    methodOrdinal: (id, name) => byIdMap.get(id)?.methods[name],
    iterate: () => byIdMap.values(),
    methodCodec: (id, mid, dir) => codecsByIface.get(id)?.get(mid)?.[dir],
  };
};
