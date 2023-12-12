export class ZipWriter {
    /**
     * @param {{
     *   date: Date,
     * }} options
     */
    constructor(options?: {
        date: Date;
    });
    /** type {Map<string, ZFile>} */
    files: Map<any, any>;
    date: Date;
    /**
     * @param {string} name
     * @param {Uint8Array} content
     * @param {{
     *   mode?: number,
     *   date?: Date,
     *   comment?: string,
     * }} [options]
     */
    write(name: string, content: Uint8Array, options?: {
        mode?: number | undefined;
        date?: Date | undefined;
        comment?: string | undefined;
    } | undefined): void;
    /**
     * @returns {Uint8Array}
     */
    snapshot(): Uint8Array;
}
export function writeZip(): import('./types.js').ArchiveWriter;
//# sourceMappingURL=writer.d.ts.map