// @ts-check

/**
 * @typedef {{
 *   name: string,
 *   mode: number,
 *   date: Date?,
 *   content: Uint8Array,
 *   comment: string,
 * }} ArchivedFile
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
 *   compressionMethod: string,
 *   compressedLength: number,
 *   uncompressedLength: number,
 *   content: Uint8Array,
 *   comment: Uint8Array,
 * }} CompressedFile
 *
 * @typedef {{
 *   versionNeeded: number,
 *   bitFlag: number,
 *   compressionMethod: string,
 *   date: Date?,
 *   crc32: number,
 *   compressedLength: number,
 *   uncompressedLength: number,
 * }} ArchiveHeaders
 */
