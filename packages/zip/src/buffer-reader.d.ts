export class BufferReader {
    /**
     * @param {ArrayBuffer} buffer
     */
    constructor(buffer: ArrayBuffer);
    /**
     * @returns {number}
     */
    get length(): number;
    /**
     * @param {number} index
     */
    set index(arg: number);
    /**
     * @returns {number}
     */
    get index(): number;
    /**
     * @param {number} offset
     */
    set offset(arg: number);
    /**
     * @param {number} index
     * @returns {boolean} whether the read head can move to the given absolute
     * index.
     */
    canSeek(index: number): boolean;
    /**
     * @param {number} index the index to check.
     * @throws {Error} an Error if the index is out of bounds.
     */
    assertCanSeek(index: number): void;
    /**
     * @param {number} index
     * @returns {number} prior index
     */
    seek(index: number): number;
    /**
     * @param {number} size
     * @returns {Uint8Array}
     */
    peek(size: number): Uint8Array;
    /**
     * @param {number} offset
     */
    canRead(offset: number): boolean;
    /**
     * Check that the offset will not go too far.
     *
     * @param {number} offset the additional offset to check.
     * @throws {Error} an Error if the offset is out of bounds.
     */
    assertCanRead(offset: number): void;
    /**
     * Get raw data without conversion, <size> bytes.
     *
     * @param {number} size the number of bytes to read.
     * @returns {Uint8Array} the raw data.
     */
    read(size: number): Uint8Array;
    /**
     * @returns {number}
     */
    readUint8(): number;
    /**
     * @returns {number}
     * @param {boolean=} littleEndian
     */
    readUint16(littleEndian?: boolean | undefined): number;
    /**
     * @returns {number}
     * @param {boolean=} littleEndian
     */
    readUint32(littleEndian?: boolean | undefined): number;
    /**
     * @param {number} index
     * @returns {number}
     */
    byteAt(index: number): number;
    /**
     * @param {number} offset
     */
    skip(offset: number): void;
    /**
     * @param {Uint8Array} expected
     * @returns {boolean}
     */
    expect(expected: Uint8Array): boolean;
    /**
     * @param {number} index
     * @param {Uint8Array} expected
     * @returns {boolean}
     */
    matchAt(index: number, expected: Uint8Array): boolean;
    /**
     * @param {Uint8Array} expected
     */
    assert(expected: Uint8Array): void;
    /**
     * @param {Uint8Array} expected
     * @returns {number}
     */
    findLast(expected: Uint8Array): number;
}
export type BufferReaderState = {
    bytes: Uint8Array;
    data: DataView;
    length: number;
    index: number;
    offset: number;
};
//# sourceMappingURL=buffer-reader.d.ts.map