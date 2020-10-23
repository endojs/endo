// @ts-check

import { BufferReader } from "./buffer-reader.js";
import { readZip } from "./format-reader.js";

export class ZipReader {
  /**
   * @param {Uint8Array} data
   */
  constructor(data, options = {}) {
    const { name = "<unknown>" } = options;
    const reader = new BufferReader(data);
    this.files = readZip(reader);
    this.name = name;
  }

  /**
   * @param {string} name
   * @return {Uint8Array}
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
   * @return {ArchivedStat=}
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
