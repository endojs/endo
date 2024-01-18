export class BufferWriter {
    /**
     * @param {number=} capacity
     */
    constructor(capacity?: number | undefined);
    /**
     * @returns {number}
     */
    get length(): number;
    /**
     * @param {number} index
     */
    set index(index: number);
    /**
     * @returns {number}
     */
    get index(): number;
    /**
     * @param {number} required
     */
    ensureCanSeek(required: number): void;
    /**
     * @param {number} index
     */
    seek(index: number): void;
    /**
     * @param {number} size
     */
    ensureCanWrite(size: number): void;
    /**
     * @param {Uint8Array} bytes
     */
    write(bytes: Uint8Array): void;
    /**
     * @param {number} start
     * @param {number} end
     */
    writeCopy(start: number, end: number): void;
    /**
     * @param {number} value
     */
    writeUint8(value: number): void;
    /**
     * @param {number} value
     * @param {boolean=} littleEndian
     */
    writeUint16(value: number, littleEndian?: boolean | undefined): void;
    /**
     * @param {number} value
     * @param {boolean=} littleEndian
     */
    writeUint32(value: number, littleEndian?: boolean | undefined): void;
    /**
     * @param {number=} begin
     * @param {number=} end
     * @returns {Uint8Array}
     */
    subarray(begin?: number | undefined, end?: number | undefined): Uint8Array;
    /**
     * @param {number=} begin
     * @param {number=} end
     * @returns {Uint8Array}
     */
    slice(begin?: number | undefined, end?: number | undefined): Uint8Array;
}
//# sourceMappingURL=buffer-writer.d.ts.map