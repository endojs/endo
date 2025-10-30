// @ts-check

export {};

/**
 * @typedef {object} ArchivedFile
 * @property {string} name
 * @property {'file'} type
 * @property {Date | null} date
 * @property {number} mode
 * @property {number} crc32
 * @property {0 | 8 | 12 | number} compressionMethod
 * @property {number} compressedLength
 * @property {number} uncompressedLength
 * @property {string} comment
 * @property {Uint8Array} content
 */

/**
 * @typedef ArchivedStat
 * @property {'file' | 'directory'} type
 * @property {Date | null} date
 * @property {number} mode
 * @property {string} comment
 */

/**
 * @typedef ArchiveHeaders
 * @property {number} versionNeeded
 * @property {number} bitFlag
 * @property {Date | null} date
 * @property {number} crc32
 * @property {0 | 8 | 12 | number} compressionMethod
 * @property {number} compressedLength
 * @property {number} uncompressedLength
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

/**
 * @callback CompressNowFn
 * @param {Uint8Array} content
 * @returns {Uint8Array}
 */

/**
 * @callback CompressFn
 * @param {Uint8Array} content
 * @returns {Promise<Uint8Array>}
 */

/**
 * @callback DecompressNowFn
 * @param {Uint8Array} content
 * @returns {Uint8Array}
 */

/**
 * @callback DecompressFn
 * @param {Uint8Array} content
 * @returns {Promise<Uint8Array>}
 */
