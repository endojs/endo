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
 * Two flavours of encode/decode:
 *
 *   • `encode(name, value)` / `decode(name, bytes)` — cap-free path. The
 *     framed bytes are a complete Cap'n Proto message, returned as an
 *     `ArrayBuffer`. If the schema has capability fields and the input
 *     carries non-null values for them, encoding throws (no cap table to
 *     write the descriptors into).
 *   • `encodePayload(name, value, ctx)` / `decodePayload(name, payload,
 *     ctx)` — cap-aware path. Returns / accepts the `{ contentBytes,
 *     capTable }` shape that drops directly into a Cap'n Proto `Payload`
 *     struct. Use this when feeding the result into Call/Return params,
 *     or wrap method codecs via `registerInterface(registry, name)`.
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

  /**
   * Build a cap-aware codec pair (encode + decode) for one struct layout.
   * Used by `registerInterface` to derive request/response codecs for
   * each method's synthetic Params/Results struct without writing four
   * near-identical closures by hand.
   *
   * @param {import('./layout.js').StructLayout} layout
   */
  const makeStructCodec = layout => ({
    /** @param {any} value @param {any} [ctx] */
    encode: (value, ctx) => {
      /** @type {any[]} */
      const capTable = [];
      const ab = encodeRootStruct(value, layout, layouts, {
        exportCap: ctx ? ctx.exportCap : undefined,
        capTable,
      });
      return { contentBytes: new Uint8Array(ab), capTable };
    },
    /**
     * @param {ArrayBuffer | Uint8Array} contentBytes
     * @param {any[]} [capTable]
     * @param {any} [ctx]
     */
    decode: (contentBytes, capTable, ctx) =>
      decodeRootStruct(contentBytes, layout, layouts, {
        importCap: ctx ? ctx.importCap : undefined,
        capTable: capTable || [],
      }),
  });

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
    encodePayload: (structName, value, ctx) =>
      makeStructCodec(requireLayout(structName)).encode(value, ctx),
    /**
     * Cap-aware decode. Takes the `{ contentBytes, capTable }` shape from a
     * Cap'n Proto Payload struct.
     *
     * @param {string} structName
     * @param {{ contentBytes: ArrayBuffer | Uint8Array, capTable: any[] }} payload
     * @param {{ importCap: (desc: any) => unknown }} ctx
     */
    decodePayload: (structName, payload, ctx) =>
      makeStructCodec(requireLayout(structName)).decode(
        payload.contentBytes,
        payload.capTable,
        ctx,
      ),
    /**
     * Register an interface declared in the .capnp schema with an
     * `@endo/capn-proto` InterfaceRegistry, automatically deriving the
     * methods map AND per-method request/response codecs from the
     * synthetic Params/Results structs the parser produced. Capability-
     * typed params and results pass through the same exportCap / importCap
     * path that the JSON payload codec uses, so methods that take or
     * return caps continue to work.
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
            decode: (contentBytes, capTable, ctx) => [
              paramsCodec.decode(contentBytes, capTable, ctx),
            ],
          },
          // Response is the value verbatim — no array shimming needed.
          response: resultsCodec,
        };
      }
      registry.register({ id: iface.id, methods, methodCodecs });
    },
  };
};

export { parseCapnpSchema } from './parse.js';
export { layoutSchema, layoutStruct } from './layout.js';
export { encodeRootStruct, decodeRootStruct } from './codec.js';
