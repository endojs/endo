// @ts-check

import { crc32 } from './crc32.js';
import { BufferWriter } from './buffer-writer.js';
import { writeZip as writeZipFormat } from './format-writer.js';
import { STORE, DEFLATE } from './compression.js';

/** @import { ArchivedFile, ArchiveWriter, WriteFn, SnapshotFn, CompressFn, CompressNowFn } from './types.js' */

/** @type {CompressFn} */
const store = async content => content;
/** @type {CompressNowFn} */
const storeNow = content => content;

export class ZipWriter {
  /**
   * @param {object} [options]
   * @param {CompressFn} [options.deflate]
   * @param {CompressNowFn} [options.deflateNow]
   */
  constructor(options = {}) {
    const { deflate = undefined, deflateNow = undefined } = options;

    let compressionMethod = STORE;
    /** @type {CompressFn | undefined} */
    let compressor = store;
    /** @type {CompressNowFn | undefined} */
    let syncCompressor = storeNow;
    if (deflate || deflateNow) {
      compressionMethod = DEFLATE;
      compressor = deflate;
      syncCompressor = deflateNow;
    }

    /** type {Map<string, ArchivedFile>} */
    this.files = new Map();
    this.compressionMethod = compressionMethod;
    this.compressor = compressor;
    this.syncCompressor = syncCompressor;
  }

  /**
   * @param {string} name
   * @param {Uint8Array} uncompressedContent
   * @param {{
   *   mode?: number,
   *   date?: Date,
   *   comment?: string,
   * }} [options]
   * @deprecated Use {@link setNow} for a direct replacement. Use {@link set}
   * if {@link ZipWriter} constructed with an async compressor like `deflate`.
   */
  write(name, uncompressedContent, options) {
    return this.setNow(name, uncompressedContent, options);
  }

  /**
   * @param {string} name
   * @param {Uint8Array} uncompressedContent
   * @param {{
   *   mode?: number,
   *   date?: Date,
   *   comment?: string,
   * }} [options]
   */
  setNow(name, uncompressedContent, options = {}) {
    const { mode = 0o644, date = undefined, comment = '' } = options;
    if (!uncompressedContent) {
      throw Error(`ZipWriter write requires content for ${name}`);
    }
    const { syncCompressor, compressionMethod } = this;
    if (!syncCompressor) {
      throw Error(`ZipWriter write requires a compressor for ${name}`);
    }
    const content = syncCompressor(uncompressedContent);
    this.files.set(name, {
      name,
      type: /** @type {const} */ ('file'),
      date,
      mode,
      crc32: crc32(uncompressedContent),
      compressionMethod,
      compressedLength: content.byteLength,
      uncompressedLength: uncompressedContent.byteLength,
      comment,
      content,
    });
  }

  /**
   * @param {string} name
   * @param {Uint8Array} uncompressedContent
   * @param {{
   *   mode?: number,
   *   date?: Date,
   *   comment?: string,
   * }} [options]
   */
  async set(name, uncompressedContent, options = {}) {
    const { mode = 0o644, date = undefined, comment = '' } = options;
    if (!uncompressedContent) {
      throw Error(`ZipWriter write requires content for ${name}`);
    }
    const { compressor, compressionMethod } = this;
    if (!compressor) {
      throw Error(
        `ZipWriter write requires compressor for ${name} and compression method ${compressionMethod}`,
      );
    }
    const content = await compressor(uncompressedContent);
    this.files.set(name, {
      name,
      type: /** @type {const} */ ('file'),
      compressionMethod,
      date,
      crc32: crc32(uncompressedContent),
      compressedLength: content.byteLength,
      uncompressedLength: uncompressedContent.byteLength,
      mode,
      comment,
      content,
    });
  }

  /**
   * @returns {Uint8Array}
   */
  snapshot() {
    const writer = new BufferWriter();
    writeZipFormat(writer, Array.from(this.files.values()));
    return writer.subarray();
  }
}

/**
 * @param {object} [options]
 * @param {CompressFn} [options.deflate]
 * @param {CompressNowFn} [options.deflateNow]
 * @returns {ArchiveWriter}
 */
export const writeZip = options => {
  const writer = new ZipWriter(options);
  /** @type {WriteFn} */
  const write = async (path, data) => {
    return writer.set(path, data);
  };
  /** @type {SnapshotFn} */
  const snapshot = async () => writer.snapshot();
  return { write, snapshot };
};
