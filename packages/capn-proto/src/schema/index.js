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
 *
 *   • `encode(name, value)` / `decode(name, bytes)` — cap-free path. The
 *     framed bytes are a complete Cap'n Proto message, returned as an
 *     `ArrayBuffer`. If the schema has capability fields and the input
 *     carries non-null values for them, encoding throws (no cap table to
 *     write the descriptors into).
 *   • `registerInterface(registry, name)` — register every method declared
 *     in an interface with an InterfaceRegistry, deriving each method's
 *     request/response codec from the schema. Method codecs follow the
 *     Cap'n Proto wire shape: encode returns `{ encodeContent, capTable }`
 *     where `encodeContent(msg, slot)` writes the request/response struct
 *     directly at `Payload.content`'s AnyPointer slot — byte-compatible
 *     with what capnp-C++ emits for the same schema.
 */

import { Fail } from '@endo/errors';
import harden from '@endo/harden';
import { parseCapnpSchema } from './parse.js';
import { layoutSchema } from './layout.js';
import {
  encodeRootStruct,
  decodeRootStruct,
  encodeStructInto,
  decodeStructFrom,
} from './codec.js';

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

  /**
   * Build a method codec pair (encode + decode) for one struct layout.
   * Used by `registerInterface` to derive request/response codecs for
   * each method's synthetic Params/Results struct.
   *
   * Encode returns `{ encodeContent, capTable }` ready for `writePayload`
   * to drop into a Cap'n Proto Payload: `encodeContent(msg, slot)` allocates
   * the struct at the AnyPointer slot and writes its fields, populating the
   * shared `capTable` along the way for any capability-typed fields.
   *
   * Decode takes the `{ contentSlot, capTable }` shape that `readPayload`
   * returns, resolves the AnyPointer at contentSlot to a struct, and
   * decodes its fields.
   *
   * @param {import('./layout.js').StructLayout} layout
   */
  const makeStructCodec = layout => ({
    /**
     * @param {any} value
     * @param {{ exportCap?: (v: unknown) => any, importCap?: (d: any) => unknown }} [ctx]
     * @returns {{
     *   encodeContent: (msg: any, slot: { segId: number, wordOffset: number }) => void,
     *   capTable: any[],
     * }}
     */
    encode: (value, ctx) => {
      /** @type {any[]} */
      const capTable = [];
      return {
        encodeContent: (msg, slot) => {
          encodeStructInto(msg, slot, layout, value, layouts, {
            exportCap: ctx ? ctx.exportCap : undefined,
            capTable,
          });
        },
        capTable,
      };
    },
    /**
     * @param {{ contentSlot: { msg: any, segId: number, wordOffset: number } | null, capTable: any[] }} payload
     * @param {{ exportCap?: (v: unknown) => any, importCap?: (d: any) => unknown }} [ctx]
     */
    decode: (payload, ctx) => {
      if (!payload.contentSlot) return null;
      return decodeStructFrom(payload.contentSlot, layout, layouts, {
        importCap: ctx ? ctx.importCap : undefined,
        capTable: payload.capTable || [],
      });
    },
  });

  return harden({
    fileId: parsed.fileId,
    structs: layouts,
    interfaces: parsed.interfaces,
    layoutOf: requireLayout,
    /**
     * Encode without a cap-table context. If the schema declares any
     * capability fields and the corresponding values are non-null, this
     * will throw — capability values need a cap table to write descriptors
     * into. For RPC use `registerInterface` instead, which wires every
     * method codec to the connection's exportCap / importCap.
     *
     * @param {string} structName
     * @param {any} value
     * @returns {ArrayBuffer}
     */
    encode: (structName, value) =>
      encodeRootStruct(value, requireLayout(structName), layouts),
    /**
     * Decode without a cap-table context. Capability fields cause a
     * throw when their slot is non-null.
     *
     * @param {string} structName
     * @param {ArrayBuffer | Uint8Array} framed
     * @returns {any}
     */
    decode: (structName, framed) =>
      decodeRootStruct(framed, requireLayout(structName), layouts),
    /**
     * Build a request/response method codec pair for one struct layout
     * directly. Tests and advanced users that want to drive the wire
     * format by hand can call this; everyday code uses
     * `registerInterface` instead.
     *
     * @param {string} structName
     */
    structCodec: structName => makeStructCodec(requireLayout(structName)),
    /**
     * Register an interface declared in the .capnp schema with an
     * `@endo/capn-proto` InterfaceRegistry, automatically deriving the
     * methods map AND per-method request/response codecs from the
     * synthetic Params/Results structs the parser produced. Capability-
     * typed params and results pass through the connection's exportCap /
     * importCap so methods that take or return caps work transparently.
     *
     * @param {{ register: (desc: any) => void }} registry
     * @param {string} ifaceName
     */
    registerInterface: (registry, ifaceName) => {
      const iface = parsed.interfaces.get(ifaceName);
      if (!iface) throw Fail`unknown interface ${ifaceName}`;
      /** @type {Record<string, number>} */
      const methods = {};
      /** @type {Record<string, { request: any, response: any }>} */
      const methodCodecs = {};
      for (const m of iface.methods) {
        methods[m.name] = m.ordinal;
        const paramsCodec = makeStructCodec(requireLayout(m.paramsStructName));
        const resultsCodec = makeStructCodec(
          requireLayout(m.resultsStructName),
        );
        methodCodecs[m.name] = {
          request: {
            // eventual-send hands a method's args as a positional array
            // `[paramsObj]`. The struct codec only knows how to encode /
            // decode a single value, so the request adaptor is just an
            // index-into-args / wrap-in-array shim around makeStructCodec.
            encode: (args, ctx) => paramsCodec.encode(args[0], ctx),
            decode: (payload, ctx) => [paramsCodec.decode(payload, ctx)],
          },
          // Response is the value verbatim — no array shimming needed.
          response: resultsCodec,
        };
      }
      registry.register({ id: iface.id, methods, methodCodecs });
    },
  });
};

export { parseCapnpSchema } from './parse.js';
export { layoutSchema, layoutStruct } from './layout.js';
export {
  encodeRootStruct,
  decodeRootStruct,
  encodeStructInto,
  decodeStructFrom,
} from './codec.js';
