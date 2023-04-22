// @ts-check

import { BufferWriter } from './buffer-writer.js';
import { writeZip as writeZipFormat } from './format-writer.js';

export class ZipWriter {
  /**
   * @param {{
   *   date: Date,
   * }} options
   */
  constructor(options = { date: new Date() }) {
    const { date } = options;
    /** type {Map<string, ZFile>} */
    this.files = new Map();
    this.date = date;
  }

  /**
   * @param {string} name
   * @param {Uint8Array} content
   * @param {{
   *   mode?: number,
   *   date?: Date,
   *   comment?: string,
   * }} [options]
   */
  write(name, content, options = {}) {
    const { mode = 0o644, date = undefined, comment = '' } = options;
    if (!content) {
      throw Error(`ZipWriter write requires content for ${name}`);
    }
    this.files.set(name, {
      name,
      mode,
      date,
      content,
      comment,
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
 * @returns {import('./types.js').ArchiveWriter}
 */
export const writeZip = () => {
  const writer = new ZipWriter();
  /** @type {import('./types.js').WriteFn} */
  const write = async (path, data) => {
    writer.write(path, data);
  };
  /** @type {import('./types.js').SnapshotFn} */
  const snapshot = async () => writer.snapshot();
  return { write, snapshot };
};
