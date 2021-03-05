// @ts-check

/**
 * Decouples Zip usage from JSZip's particular presentation.
 */

import { ZipReader } from './zip/reader.js';
import { ZipWriter } from './zip/writer.js';

/**
 * @param {Uint8Array} data
 * @param {string} location
 * @returns {Promise<ArchiveReader>}
 */
export const readZip = async (data, location) => {
  const reader = new ZipReader(data, { name: location });
  /** @type {ReadFn} */
  const read = async path => reader.read(path);
  return { read };
};

/**
 * @returns {ArchiveWriter}
 */
export const writeZip = () => {
  const writer = new ZipWriter();
  /** @type {WriteFn} */
  const write = async (path, data) => {
    writer.write(path, data);
  };
  /** @type {SnapshotFn} */
  const snapshot = async () => writer.snapshot();
  return { write, snapshot };
};
