// @ts-check
import "./types.js";
import { BufferWriter } from "./buffer-writer.js";
import { writeZip } from "./format-writer.js";

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
   * }?} options
   */
  write(name, content, options = {}) {
    // @ts-ignore
    const { mode = 0o644, date = undefined, comment = "" } = options;
    if (!content) {
      throw new Error(`ZipWriter write requires content for ${name}`);
    }
    this.files.set(name, {
      name,
      mode,
      date,
      content,
      comment
    });
  }

  /**
   * @returns {Uint8Array}
   */
  snapshot() {
    const writer = new BufferWriter();
    writeZip(writer, Array.from(this.files.values()));
    return writer.subarray();
  }
}
