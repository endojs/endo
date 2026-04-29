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
    layoutOf: requireLayout,
    /**
     * @param {string} structName
     * @param {any} value
     * @returns {ArrayBuffer}
     */
    encode: (structName, value) =>
      encodeRootStruct(value, requireLayout(structName), layouts),
    /**
     * @param {string} structName
     * @param {ArrayBuffer | Uint8Array} framed
     * @returns {any}
     */
    decode: (structName, framed) =>
      decodeRootStruct(framed, requireLayout(structName), layouts),
  };
};

export { parseCapnpSchema } from './parse.js';
export { layoutSchema, layoutStruct } from './layout.js';
export { encodeRootStruct, decodeRootStruct } from './codec.js';
