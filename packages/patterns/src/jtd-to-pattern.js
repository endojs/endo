/** @import {Pattern} from './types.js' */

/**
 *
 * @param {any} jtdSchema a JSON Type Definition schema per RFC 8927
 * @returns {Pattern}
 */
export const convertJTDToPattern = jtdSchema => {
  if (typeof jtdSchema !== 'object' || jtdSchema === null) {
    throw new Error('Invalid JTD schema: must be an object');
  }

  if ('enum' in jtdSchema) {
    return { enum: jtdSchema.enum };
  }

  if ('type' in jtdSchema) {
    switch (jtdSchema.type) {
      case 'boolean':
        return { type: 'boolean' };
      case 'string':
        return { type: 'string' };
      case 'timestamp':
        return { type: 'string', format: 'date-time' };
      case 'float32':
      case 'float64':
        return { type: 'number' };
      case 'int8':
      case 'uint8':
      case 'int16':
      case 'uint16':
      case 'int32':
      case 'uint32':
        return { type: 'integer' };
      default:
        throw new Error(`Unsupported JTD type: ${jtdSchema.type}`);
    }
  }

  if ('properties' in jtdSchema) {
    const properties = {};
    for (const [key, value] of Object.entries(jtdSchema.properties)) {
      properties[key] = convertJTDToPattern(value);
    }
    return {
      type: 'object',
      properties,
      required: Object.keys(jtdSchema.properties),
    };
  }

  if ('optionalProperties' in jtdSchema) {
    const properties = {};
    for (const [key, value] of Object.entries(jtdSchema.optionalProperties)) {
      properties[key] = convertJTDToPattern(value);
    }
    return {
      type: 'object',
      properties,
    };
  }

  if ('elements' in jtdSchema) {
    return {
      type: 'array',
      items: convertJTDToPattern(jtdSchema.elements),
    };
  }

  if ('values' in jtdSchema) {
    return {
      type: 'object',
      additionalProperties: convertJTDToPattern(jtdSchema.values),
    };
  }

  throw new Error('Invalid JTD schema: no recognized schema form');
};
