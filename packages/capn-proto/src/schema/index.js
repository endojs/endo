// @ts-check
/**
 * Schema runtime entry points.
 *
 *   const schema = loadSchema(capnpText);
 *   const bytes = schema.encode('MyStruct', jsObject);
 *   const obj = schema.decode('MyStruct', bytes);
 *
 * The schema object is reusable and immutable. For multi-file schemas,
 * concatenate the files (or load them separately and merge).
 */

import { Fail } from '@endo/errors';
import { parseCapnpSchema } from './parse.js';
import { layoutSchema } from './layout.js';
import { encodeRootStruct, decodeRootStruct } from './codec.js';

/**
 * @param {string} capnpText
 */
export const loadSchema = capnpText => {
  const parsed = parseCapnpSchema(capnpText);
  const layouts = layoutSchema(parsed);
  const requireLayout = name => {
    const l = layouts.get(name);
    if (!l) throw Fail`unknown struct ${name}`;
    return l;
  };
  return {
    fileId: parsed.fileId,
    structs: layouts,
    interfaces: parsed.interfaces,
    layoutOf: requireLayout,
    /**
     * Encode without a cap-table context. If the schema declares any
     * capability fields and the corresponding values are non-null, this
     * will throw — use `encodePayload` instead for cap-aware encoding.
     *
     * @param {string} structName
     * @param {any} value
     * @returns {ArrayBuffer}
     */
    encode: (structName, value) =>
      encodeRootStruct(value, requireLayout(structName), layouts),
    /**
     * Decode without a cap-table context. Capability fields cause a
     * throw when their slot is non-null — use `decodePayload` instead.
     *
     * @param {string} structName
     * @param {ArrayBuffer | Uint8Array} framed
     * @returns {any}
     */
    decode: (structName, framed) =>
      decodeRootStruct(framed, requireLayout(structName), layouts),
    /**
     * Cap-aware encode. Returns `{ contentBytes, capTable }` ready to drop
     * into a Cap'n Proto Payload struct.
     *
     * @param {string} structName
     * @param {any} value
     * @param {{ exportCap: (v: unknown) => any }} ctx
     * @returns {{ contentBytes: Uint8Array, capTable: any[] }}
     */
    encodePayload: (structName, value, ctx) => {
      /** @type {any[]} */
      const capTable = [];
      const ab = encodeRootStruct(value, requireLayout(structName), layouts, {
        exportCap: ctx.exportCap,
        capTable,
      });
      return { contentBytes: new Uint8Array(ab), capTable };
    },
    /**
     * Cap-aware decode. Takes the `{ contentBytes, capTable }` shape from a
     * Cap'n Proto Payload struct.
     *
     * @param {string} structName
     * @param {{ contentBytes: ArrayBuffer | Uint8Array, capTable: any[] }} payload
     * @param {{ importCap: (desc: any) => unknown }} ctx
     */
    decodePayload: (structName, payload, ctx) =>
      decodeRootStruct(
        payload.contentBytes,
        requireLayout(structName),
        layouts,
        { importCap: ctx.importCap, capTable: payload.capTable },
      ),
  };
};

export { parseCapnpSchema } from './parse.js';
export { layoutSchema, layoutStruct } from './layout.js';
export { encodeRootStruct, decodeRootStruct } from './codec.js';
