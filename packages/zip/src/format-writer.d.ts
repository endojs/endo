/**
 * @param {BufferWriter} writer
 * @param {Array<FileRecord>} records
 * @param {string} comment
 */
export function writeZipRecords(writer: BufferWriter, records: Array<FileRecord>, comment?: string): void;
/**
 * @param {BufferWriter} writer
 * @param {Array<import('./types.js').ArchivedFile>} files
 * @param {string} comment
 */
export function writeZip(writer: BufferWriter, files: Array<import('./types.js').ArchivedFile>, comment?: string): void;
export type LocalFileLocator = {
    fileStart: number;
    headerStart: number;
    headerEnd: number;
};
export type FileRecord = {
    name: Uint8Array;
    centralName: Uint8Array;
    madeBy: number;
    version: number;
    diskNumberStart: number;
    internalFileAttributes: number;
    externalFileAttributes: number;
    content: Uint8Array;
    comment: Uint8Array;
} & import('./types.js').ArchiveHeaders;
export type BufferWriter = {
    index: number;
    readonly length: number;
    write: (bytes: Uint8Array) => void;
    writeCopy: (start: number, end: number) => void;
    writeUint8: (number: number) => void;
    writeUint16: (number: number, littleEndian?: boolean) => void;
    writeUint32: (number: number, littleEndian?: boolean) => void;
};
//# sourceMappingURL=format-writer.d.ts.map