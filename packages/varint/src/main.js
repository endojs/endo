/* eslint no-bitwise: [0] */

// uint32 encodes and decodes unsigned varints up to 32 bits long.
export const uint32 = {
  // returns the number of bytes needed to represent a 32 bit unsigned integer.
  measure(number) {
    const word = number >>> 0;
    if (word !== number) {
      throw new TypeError(`Cannot measure number with more than 32 bits of unsigned integer precision: ${number}`);
    }
    if (word < 1 << 7) {
      return 1;
    }
    if (word < 1 << 14) {
      return 2;
    }
    if (word < 1 << 21) {
      return 3;
    }
    if (word < 1 << 28) {
      return 4;
    }
    return 5;
  },

  // writes an unsigned 32 bit varint to a byte array starting at the given
  // offset.
  write(buffer, number, offset) {
    let word = number >>> 0;
    if (word !== number) {
      throw new TypeError(`Cannot write number with more than 32 bits of unsigned integer precision: ${number}`);
    }
    offset >>>= 0;
    const end = offset + uint32.measure(word);
    if (end > buffer.length) {
      throw new Error(`Cannot write beyond end of buffer`);
    }
    while (word & ~0x7f) {
      buffer[offset] = (word & 0xff) | 0x80;
      offset += 1;
      word >>>= 7;
    }
    buffer[offset] = word | 0;
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

export const int32 = {
  measure(number) {
    // TODO verify all this applies given the sign shenannigans.
    // TODO guard against out of range errors.
    const word = number >>> 0;
    if (word < 1 << 7) {
      return 1;
    }
    if (word < 1 << 14) {
      return 2;
    }
    if (word < 1 << 21) {
      return 3;
    }
    if (word < 1 << 28) {
      return 4;
    }
    return 5;
  },

  write(buffer, number, offset) {
    if ((number | 0) !== number) {
      throw new TypeError(`Cannot write number with more than 32 bits of signed integer precision: ${number} (0x${number.toString(16)})`);
    }
    if (number === 0x80000000) {
      // TODO This is the only integer for which ~ does not flip the sign.
    }
    // TODO const end = offset + uint32.measure(number);
    // if (end > buffer.length) {
    //   throw new Error(`Cannot write beyond end of buffer`);
    // }

    const negative = number < 0;
    buffer[offset] = (number & 0x3f) << 1 | negative;
    number >>= 6;
    offset += 1;

    if (negative) {
      number = ~number;
    }

    while (number & ~0x7f) {
      buffer[offset] = (number & 0xff) | 0x80;
      offset += 1;
      number >>>= 7;
    }
    buffer[offset] = number | 0;
    return offset;
  },

  read(buffer, offset) {
    let shift = 6;
    let bits = buffer[offset];
    let number = (bits & 0x7f) >> 1;
    const negative = bits & 1 !== 0;
    offset += 1;
    while (bits >= 0x80) {
      bits = buffer[offset];
      number += (bits & 0x7f) << shift;
      shift += 7;
      offset += 1;
    }
    if (negative) {
      number = ~number;
    }
    return number;
  },
};
