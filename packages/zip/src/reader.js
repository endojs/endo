// @ts-check
/* eslint-disable no-use-before-define */

import { STORE, DEFLATE } from './compression.js';
import { BufferReader } from './buffer-reader.js';
import { readZip as readZipFormat } from './format-reader.js';
import { crc32 } from './crc32.js';

/** @import { ArchivedFile, ArchivedStat, DecompressFn, DecompressNowFn } from './types.js' */

export class ZipReader {
  /**
   * @param {Uint8Array} data
   * @param {object} [options]
   * @param {string} [options.name]
   * @param {DecompressFn} [options.inflate]
   * @param {DecompressNowFn} [options.inflateNow]
   * @param {boolean} [options.checkCrc32]
   */
  constructor(data, options = {}) {
    const {
      name = '<unknown>',
      inflate = undefined,
      inflateNow = undefined,
      checkCrc32 = false,
    } = options;

    // @ts-expect-error missing properties from ArrayBuffer
    const reader = new BufferReader(data);
    this.files = readZipFormat(reader);
    this.name = name;
    this.inflate = inflate;
    this.inflateNow = inflateNow;
    this.checkCrc32 = checkCrc32;
  }

  /**
   * @param {string} name
   * @returns {Uint8Array}
   * @deprecated Use {@link getNow} for a direct replacement. Use {@link get}
   * if you need async decompression.
   */
  read(name) {
    return this.getNow(name);
  }

  /**
   * Get decompressed file contents synchronously.
   * Works for uncompressed files and for compressed files if {@link ZipReader}
   * constructed with corresponding synchronous decompression capability, like
   * `inflateNow`.
   * @param {string} name
   * @returns {Uint8Array}
   */
  getNow(name) {
    const file = this.files.get(name);
    if (file === undefined) {
      throw Error(`Cannot find file ${name} in ZIP file ${this.name}`);
    }
    const content = decompressNow(this, name, file);
    if (this.checkCrc32) {
      const actualCrc32 = crc32(content);
      if (actualCrc32 !== file.crc32) {
        throw Error(
          `Cannot extract file ${name} in ZIP file ${this.name} due to integrity check failure; expected CRC-32 0x${file.crc32.toString(16)}, got 0x${actualCrc32.toString(16)}`,
        );
      }
    }
    return content;
  }

  /**
   * Get promise for decompressed file contents.
   * Works for uncompressed files and for compressed files if {@link ZipReader}
   * constructed with the corresponding compression capability, like `inflate`
   * _or_ `inflateNow`.
   * @param {string} name
   * @returns {Promise<Uint8Array>}
   */
  async get(name) {
    const file = this.files.get(name);
    if (file === undefined) {
      throw Error(`Cannot find file ${name} in ZIP file ${this.name}`);
    }
    const content = await decompress(this, name, file);
    if (this.checkCrc32) {
      const actualCrc32 = crc32(content);
      if (actualCrc32 !== file.crc32) {
        throw Error(
          `Cannot extract file ${name} in ZIP file ${this.name} due to integrity check failure; expected CRC-32 0x${file.crc32.toString(16)}, got 0x${actualCrc32.toString(16)}`,
        );
      }
    }
    return content;
  }

  /**
   * @param {string} name
   * @returns {ArchivedStat | undefined}
   */
  stat(name) {
    const file = this.files.get(name);
    if (file === undefined) {
      return undefined;
    }
    return {
      type: file.type,
      mode: file.mode,
      date: file.date,
      comment: file.comment,
    };
  }
}

/**
 * @param {ZipReader} reader
 * @param {string} name
 * @param {ArchivedFile} file
 */
const decompress = (reader, name, file) => {
  if (file.compressionMethod === STORE) {
    return file.content;
  } else if (file.compressionMethod === DEFLATE) {
    const { inflateNow, inflate = inflateNow } = reader;
    if (!inflate) {
      throw new Error(
        `Cannot decompress ${name} in ZIP file ${reader.name}: no inflate implementation configured`,
      );
    }
    return inflate(file.content);
  } else {
    throw Error(
      `Cannot decompress ${name} in ZIP file ${reader.name}: method ${file.compressionMethod}`,
    );
  }
};

/**
 * @param {ZipReader} reader
 * @param {string} name
 * @param {ArchivedFile} file
 */
const decompressNow = (reader, name, file) => {
  if (file.compressionMethod === STORE) {
    return file.content;
  } else if (file.compressionMethod === DEFLATE) {
    const { inflateNow } = reader;
    if (!inflateNow) {
      throw new Error(
        `Cannot decompress ${name} in ZIP file ${reader.name}: no synchronous inflate implementation configured`,
      );
    }
    return inflateNow(file.content);
  } else {
    throw Error(
      `Cannot decompress ${name} in ZIP file ${reader.name}: method ${file.compressionMethod}`,
    );
  }
};

/**
 * @param {Uint8Array} data
 * @param {string} location
 * @param {object} [options]
 * @param {DecompressFn} [options.inflate]
 * @param {DecompressNowFn} [options.inflateNow]
 * @returns {Promise<import('./types.js').ArchiveReader>}
 */
export const readZip = async (data, location, options) => {
  const reader = new ZipReader(data, { name: location, ...options });
  /** @type {import('./types.js').ReadFn} */
  const read = async path => reader.get(path);
  return { read };
};
