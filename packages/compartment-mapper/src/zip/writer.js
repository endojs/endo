// @ts-check
import "./types.js";
import { BufferWriter } from "./buffer-writer.js";
import { writeZip } from "./format-writer.js";

export class ZipWriter {
  /**
   * @param {{
   *   date: Date,
   *   comment: string
   * }} options
   */
  constructor(options = { date: new Date(), comment: "" }) {
    const { date, comment } = options;
    /** type {Map<string, ZFile>} */
    this.files = new Map();
    this.date = date;
    this.comment = comment;
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

  get data() {
    const writer = new BufferWriter();
    writeZip(writer, Array.from(this.files.values()), this.comment);
    return writer.subarray();
  }
}
