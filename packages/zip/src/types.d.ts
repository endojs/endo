export type ArchivedStat = {
    mode: number;
    date: Date | null;
    comment: string;
    type: "file" | "directory";
};
export type ArchivedFile = {
    name: string;
    content: Uint8Array;
} & ArchivedStat;
export type UncompressedFile = {
    name: Uint8Array;
    mode: number;
    date: Date | null;
    content: Uint8Array;
    comment: Uint8Array;
};
export type CompressedFile = {
    name: Uint8Array;
    mode: number;
    date: Date | null;
    crc32: number;
    compressionMethod: number;
    compressedLength: number;
    uncompressedLength: number;
    content: Uint8Array;
    comment: Uint8Array;
};
export type ArchiveHeaders = {
    versionNeeded: number;
    bitFlag: number;
    compressionMethod: number;
    date: Date | null;
    crc32: number;
    compressedLength: number;
    uncompressedLength: number;
};
export type ArchiveReader = {
    read: ReadFn;
};
export type ReadFn = (name: string) => Promise<Uint8Array>;
export type ArchiveWriter = {
    write: WriteFn;
    snapshot: SnapshotFn;
};
export type WriteFn = (name: string, bytes: Uint8Array) => Promise<void>;
export type SnapshotFn = () => Promise<Uint8Array>;
//# sourceMappingURL=types.d.ts.map