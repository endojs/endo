import { M } from './types.js';

/**
 * @param {any} jtdSchema a JSON Type Definition schema per RFC 8927
 * @returns {import('./types.js').Pattern}
 */
export const convertJTDToPattern = jtdSchema => {
  if (typeof jtdSchema !== 'object' || jtdSchema === null) {
    throw new Error('Invalid JTD schema: must be an object');
  }

  if ('enum' in jtdSchema) {
    return M.enums(jtdSchema.enum);
  }

  if ('type' in jtdSchema) {
    switch (jtdSchema.type) {
      case 'boolean':
        return M.boolean();
      case 'string':
        return M.string();
      case 'timestamp':
        return M.string(); // TODO: Add specific timestamp validation
      case 'float32':
      case 'float64':
        return M.number();
      case 'int8':
      case 'uint8':
      case 'int16':
      case 'uint16':
      case 'int32':
      case 'uint32':
        return M.integer();
      default:
        throw new Error(`Unsupported JTD type: ${jtdSchema.type}`);
    }
  }

  if ('properties' in jtdSchema) {
    const properties = {};
    for (const [key, value] of Object.entries(jtdSchema.properties)) {
      properties[key] = convertJTDToPattern(value);
    }
    return M.record(properties);
  }

  if ('optionalProperties' in jtdSchema) {
    const properties = {};
    for (const [key, value] of Object.entries(jtdSchema.optionalProperties)) {
      properties[key] = M.optional(convertJTDToPattern(value));
    }
    return M.record(properties);
  }

  if ('elements' in jtdSchema) {
    return M.array(convertJTDToPattern(jtdSchema.elements));
  }

  if ('values' in jtdSchema) {
    return M.record({
      [M.string()]: convertJTDToPattern(jtdSchema.values),
    });
  }

  throw new Error('Invalid JTD schema: no recognized schema form');
};
