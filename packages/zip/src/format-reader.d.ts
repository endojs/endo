/**
 * @param {BufferReader} reader
 * @param {string} name
 */
export function readZip(reader: BufferReader, name?: string): Map<any, any>;
export type ArchiveHeaders = import('./types.js').ArchiveHeaders;
export type CompressedFile = import('./types.js').CompressedFile;
export type UncompressedFile = import('./types.js').UncompressedFile;
export type ArchivedFile = import('./types.js').ArchivedFile;
export type CentralFileRecord = {
    name: Uint8Array;
    version: number;
    madeBy: number;
    fileStart: number;
    diskNumberStart: number;
    internalFileAttributes: number;
    externalFileAttributes: number;
    comment: Uint8Array;
} & ArchiveHeaders;
export type LocalFileRecord = {
    name: Uint8Array;
    content: Uint8Array;
} & ArchiveHeaders;
export type CentralDirectoryLocator = {
    diskNumber: number;
    diskWithCentralDirStart: number;
    centralDirectoryRecordsOnThisDisk: number;
    centralDirectoryRecords: number;
    centralDirectorySize: number;
    centralDirectoryOffset: number;
    comment: string;
};
export type BufferReader = {
    readonly length: number;
    offset: number;
    read: (size: number) => Uint8Array;
    skip: (size: number) => void;
    seek: (index: number) => void;
    expect: (bytes: Uint8Array) => boolean;
    readUint8: () => number;
    readUint16: (littleEndian?: boolean) => number;
    readUint32: (littleEndian?: boolean) => number;
};
//# sourceMappingURL=format-reader.d.ts.map