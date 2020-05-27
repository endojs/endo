/* eslint no-bitwise: [0] */

// uint32 encodes and decodes unsigned varints up to 32 bits long.
export const uint32 = {
  // returns the number of bytes needed to represent a 32 bit unsigned integer.
  measure(number) {
    number >>>= 0;
    if (number < 1 << 7) {
      return 1;
    }
    if (number < 1 << 14) {
      return 2;
    }
    if (number < 1 << 21) {
      return 3;
    }
    if (number < 1 << 28) {
      return 4;
    }
    return 5;
  },

  // writes an unsigned 32 bit varint to a byte array starting at the given
  // offset.
  write(buffer, number, offset) {
    number >>>= 0;
    offset >>>= 0;
    const end = offset + uint32.measure(number);
    if (end > buffer.length) {
      throw new Error(`Cannot write beyond end of buffer`);
    }
    while (number & ~0x7f) {
      buffer[offset] = (number & 0xff) | 0x80;
      offset += 1;
      number >>>= 7;
    }
    buffer[offset] = number | 0;
    return offset;
  },

  // reads a 32 bit unsigned varint from the buffer starting at the given
  // offset.
  read(buffer, offset) {
    let number = 0;
    let shift = 0;
    let bits = 0;
    do {
      bits = buffer[offset];
      offset += 1;
      number += (bits & 0x7f) << shift;
      shift += 7;
    } while (bits >= 0x80);
    return number >>> 0;
  }
};
