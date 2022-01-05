// @ts-check

const isHostLittleEndian = () => {
  const array8 = new Uint8Array([1, 0]);
  const array16 = new Uint16Array(array8.buffer);
  return array16[0] === 1;
};

export const hostIsLittleEndian = isHostLittleEndian();
