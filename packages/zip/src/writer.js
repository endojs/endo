// @ts-check

import { BufferWriter } from './buffer-writer.js';
import { writeZip as writeZipFormat } from './format-writer.js';

const LOCAL_FILE_HEADER_FIXED_BYTES = 30;
const CENTRAL_FILE_HEADER_FIXED_BYTES = 46;
const CENTRAL_DIRECTORY_END_FIXED_BYTES = 22;

/**
 * @param {Array<ZFile>} files
 * @returns {number}
 */
const estimateZipSize = files => {
  let total = CENTRAL_DIRECTORY_END_FIXED_BYTES;
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    // Names/comments are expected ASCII path segments; this estimate may be low
    // for non-ASCII but BufferWriter will grow if needed.
    const nameLength = file.name.length;
    const commentLength = file.comment.length;
    total += LOCAL_FILE_HEADER_FIXED_BYTES + nameLength + file.content.length;
    total += CENTRAL_FILE_HEADER_FIXED_BYTES + nameLength + commentLength;
  }
  return total;
};

export class ZipWriter {
  /**
   * @param {{
   *   date: Date,
   *   profileStartSpan?: (name: string, args?: Record<string, unknown>) => (args?: Record<string, unknown>) => void,
   * }} options
   */
  constructor(options = { date: new Date() }) {
    const { date, profileStartSpan = undefined } = options;
    /** type {Map<string, ZFile>} */
    this.files = new Map();
    this.date = date;
    this.profileStartSpan = profileStartSpan;
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
    const files = Array.from(this.files.values());
    const writer = new BufferWriter(estimateZipSize(files));
    writeZipFormat(writer, files, '', this.profileStartSpan);
    return writer.subarray();
  }
}

/**
 * @param {{
 *   date?: Date,
 *   profileStartSpan?: (name: string, args?: Record<string, unknown>) => (args?: Record<string, unknown>) => void,
 * }} [options]
 * @returns {import('./types.js').ArchiveWriter}
 */
export const writeZip = (options = {}) => {
  const writer = new ZipWriter({ date: new Date(), ...options });
  /** @type {import('./types.js').WriteFn} */
  const write = (path, data) => {
    writer.write(path, data);
  };
  /** @type {import('./types.js').SnapshotFn} */
  const snapshot = () => writer.snapshot();
  return { write, snapshot };
};
