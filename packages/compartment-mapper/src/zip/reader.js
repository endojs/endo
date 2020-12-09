// @ts-check

import { BufferReader } from "./buffer-reader";
import { readZip } from "./format-reader";

export class ZipReader {
  /**
   * @param {Uint8Array} data
   * @param {Object} [options]
   * @param {string} [options.name]
   */
  constructor(data, options = {}) {
    const { name = "<unknown>" } = options;
    const reader = new BufferReader(data);
    this.files = readZip(reader);
    this.name = name;
  }

  /**
   * @param {string} name
   * @returns {Uint8Array}
   */
  read(name) {
    const file = this.files.get(name);
    if (file === undefined) {
      throw new Error(`Cannot find file ${name} in Zip file ${this.name}`);
    }
    return file.content;
  }

  /**
   * @param {string} name
   * @returns {ArchivedStat=}
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
      comment: file.comment
    };
  }
}
