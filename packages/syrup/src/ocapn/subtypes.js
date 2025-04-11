const { freeze } = Object;

/** @typedef {import('../codec.js').SyrupCodec} SyrupCodec */

/** @type {SyrupCodec} */
export const PositiveIntegerCodec = freeze({
  write: (value, syrupWriter) => {
    if (typeof value !== 'bigint') {
      throw Error('PositiveIntegerCodec: value must be a bigint');
    }
    if (value < 0n) {
      throw Error('PositiveIntegerCodec: value must be positive');
    }
    syrupWriter.writeInteger(value);
  },
  read: syrupReader => {
    const value = syrupReader.readInteger();
    if (value < 0n) {
      throw Error('PositiveIntegerCodec: value must be positive');
    }
    return value;
  },
});

/** @type {SyrupCodec} */
export const FalseCodec = freeze({
  write: (value, syrupWriter) => {
    if (value) {
      throw Error('FalseCodec: value must be false');
    }
    syrupWriter.writeBoolean(value);
  },
  read: syrupReader => {
    const value = syrupReader.readBoolean();
    if (value) {
      throw Error('FalseCodec: value must be false');
    }
    return value;
  },
});
