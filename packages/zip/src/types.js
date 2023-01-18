// @ts-check

export {};

/**
 * @typedef {{
 *   mode: number,
 *   date: Date?,
 *   comment: string,
 *   type: "file" | "directory"
 * }} ArchivedStat
 *
 * @typedef {{
 *   name: string,
 *   content: Uint8Array,
 * } & ArchivedStat} ArchivedFile
 *
 * @typedef {{
 *   name: Uint8Array,
 *   mode: number,
 *   date: Date?,
 *   content: Uint8Array,
 *   comment: Uint8Array,
 * }} UncompressedFile
 *
 * @typedef {{
 *   name: Uint8Array,
 *   mode: number,
 *   date: Date?,
 *   crc32: number,
 *   compressionMethod: number,
 *   compressedLength: number,
 *   uncompressedLength: number,
 *   content: Uint8Array,
 *   comment: Uint8Array,
 * }} CompressedFile
 *
 * @typedef {{
 *   versionNeeded: number,
 *   bitFlag: number,
 *   compressionMethod: number,
 *   date: Date?,
 *   crc32: number,
 *   compressedLength: number,
 *   uncompressedLength: number,
 * }} ArchiveHeaders
 */

/**
 * @typedef {object} ArchiveReader
 * @property {ReadFn} read
 */

/**
 * @callback ReadFn
 * @param {string} name
 * @returns {Promise<Uint8Array>} bytes
 */

/**
 * @typedef {object} ArchiveWriter
 * @property {WriteFn} write
 * @property {SnapshotFn} snapshot
 */

/**
 * @callback WriteFn
 * @param {string} name
 * @param {Uint8Array} bytes
 * @returns {Promise<void>}
 */

/**
 * @callback SnapshotFn
 * @returns {Promise<Uint8Array>}
 */
