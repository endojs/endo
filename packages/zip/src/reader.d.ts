export class ZipReader {
    /**
     * @param {Uint8Array} data
     * @param {object} [options]
     * @param {string} [options.name]
     */
    constructor(data: Uint8Array, options?: {
        name?: string | undefined;
    } | undefined);
    files: Map<any, any>;
    name: string;
    /**
     * @param {string} name
     * @returns {Uint8Array}
     */
    read(name: string): Uint8Array;
    /**
     * @param {string} name
     * @returns {import('./types.js').ArchivedStat=}
     */
    stat(name: string): import('./types.js').ArchivedStat | undefined;
}
export function readZip(data: Uint8Array, location: string): Promise<import('./types.js').ArchiveReader>;
//# sourceMappingURL=reader.d.ts.map