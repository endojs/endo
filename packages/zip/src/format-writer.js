// @ts-check
/* eslint no-bitwise: ["off"] */

/** @import { ArchivedFile, ArchiveHeaders } from './types.js' */

/**
 * @typedef {{
 *  fileStart: number,
 *  headerStart: number,
 *  headerEnd: number,
 * }} LocalFileLocator
 *
 * @typedef {{
 *   name: Uint8Array,
 *   centralName: Uint8Array,
 *   madeBy: number,
 *   version: number,
 *   diskNumberStart: number,
 *   internalFileAttributes: number,
 *   externalFileAttributes: number,
 *   content: Uint8Array,
 *   comment: Uint8Array,
 * } & ArchiveHeaders} FileRecord
 *
 * @typedef {{
 *   index: number,
 *   readonly length: number,
 *   write: (bytes: Uint8Array) => void,
 *   writeCopy: (start: number, end: number) => void,
 *   writeUint8: (number: number) => void,
 *   writeUint16: (number: number, littleEndian?: boolean) => void,
 *   writeUint32: (number: number, littleEndian?: boolean) => void,
 * }} BufferWriter
 */

import * as signature from './signature.js';

const UNIX = 3;
const UNIX_VERSION = 30;

const textEncoder = new TextEncoder();

/**
 * @param {BufferWriter} writer
 * @param {Date?} date
 * @see http://www.delorie.com/djgpp/doc/rbinter/it/65/16.html
 * @see http://www.delorie.com/djgpp/doc/rbinter/it/66/16.html
 */
function writeDosDateTime(writer, date) {
  const dosTime =
    date !== undefined && date !== null
      ? (((date.getUTCFullYear() - 1980) & 0x7f) << 25) | // year
        ((date.getUTCMonth() + 1) << 21) | // month
        (date.getUTCDate() << 16) | // day
        (date.getUTCHours() << 11) | // hour
        (date.getUTCMinutes() << 5) | // minute
        (date.getUTCSeconds() >> 1) // second
      : 0; // Epoch origin by default.
  writer.writeUint32(dosTime, true);
}

/**
 * @param {BufferWriter} writer
 * @param {FileRecord} file
 * @returns {LocalFileLocator}
 */
function writeFile(writer, file) {
  // Header
  const fileStart = writer.index;
  writer.write(signature.LOCAL_FILE_HEADER);
  const headerStart = writer.index;
  // Version needed to extract
  writer.writeUint16(10, true);
  writer.writeUint16(file.bitFlag, true);
  writer.writeUint16(file.compressionMethod, true);
  writeDosDateTime(writer, file.date);
  writer.writeUint32(file.crc32, true);
  writer.writeUint32(file.compressedLength, true);
  writer.writeUint32(file.uncompressedLength, true);
  writer.writeUint16(file.name.length, true);
  const headerEnd = writer.length;

  // TODO count of extra fields length
  writer.writeUint16(0, true);
  writer.write(file.name);
  // TODO write extra fields
  writer.write(file.content);

  return {
    fileStart,
    headerStart,
    headerEnd,
  };
}

/**
 * @param {BufferWriter} writer
 * @param {FileRecord} file
 * @param {LocalFileLocator} locator
 */
function writeCentralFileHeader(writer, file, locator) {
  writer.write(signature.CENTRAL_FILE_HEADER);
  writer.writeUint8(file.version);
  writer.writeUint8(file.madeBy);
  writer.writeCopy(locator.headerStart, locator.headerEnd);
  // TODO extra fields length
  writer.writeUint16(0, true);
  writer.writeUint16(file.comment.length, true);
  writer.writeUint16(file.diskNumberStart, true);
  writer.writeUint16(file.internalFileAttributes, true);
  writer.writeUint32(file.externalFileAttributes, true);
  writer.writeUint32(locator.fileStart, true);
  writer.write(file.centralName);
  // TODO extra fields
  writer.write(file.comment);
}

/**
 * @param {BufferWriter} writer
 * @param {number} entriesCount
 * @param {number} centralDirectoryStart
 * @param {number} centralDirectoryLength
 * @param {Uint8Array} commentBytes
 */
function writeEndOfCentralDirectoryRecord(
  writer,
  entriesCount,
  centralDirectoryStart,
  centralDirectoryLength,
  commentBytes,
) {
  writer.write(signature.CENTRAL_DIRECTORY_END);
  writer.writeUint16(0, true);
  writer.writeUint16(0, true);
  writer.writeUint16(entriesCount, true);
  writer.writeUint16(entriesCount, true);
  writer.writeUint32(centralDirectoryLength, true);
  writer.writeUint32(centralDirectoryStart, true);
  writer.writeUint16(commentBytes.length, true);
  writer.write(commentBytes);
}

/**
 * Computes ZIP external file attributes field from a UNIX mode for a file.
 *
 * @param {number} mode
 * @returns {number}
 */
function externalFileAttributes(mode) {
  return ((mode & 0o777) | 0o100000) << 16;
}

// TODO Add support for directory records.
// /**
//  * @param {number} mode
//  * @return {number}
//  */
// function externalDirectoryAttributes(mode) {
//   // The 0x10 is the DOS directory attribute, which is set regardless of platform.
//   return ((mode & 0o777) | 0o40000) << 16 | 0x10;
// }

/**
 * @param {ArchivedFile} file
 */
export const fileToRecord = ({
  name: nameString,
  date,
  mode,
  crc32,
  compressionMethod,
  compressedLength,
  uncompressedLength,
  comment: commentString,
  content,
}) => {
  const name = textEncoder.encode(nameString.replace(/\\/g, '/'));
  const comment = textEncoder.encode(commentString);
  return {
    name,
    centralName: name,
    madeBy: UNIX,
    version: UNIX_VERSION,
    versionNeeded: 0, // TODO this is probably too lax.
    bitFlag: 0,
    compressionMethod,
    date,
    crc32,
    compressedLength,
    uncompressedLength,
    diskNumberStart: 0,
    internalFileAttributes: 0,
    externalFileAttributes: externalFileAttributes(mode),
    comment,
    content,
  };
};

/**
 * @param {BufferWriter} writer
 * @param {Array<ArchivedFile>} files
 * @param {string} comment
 */
export function writeZip(writer, files, comment = '') {
  const records = files.map(fileToRecord);

  // Write records with local headers.
  const locators = [];
  for (let i = 0; i < records.length; i += 1) {
    locators.push(writeFile(writer, records[i]));
  }

  // writeCentralDirectory
  const centralDirectoryStart = writer.index;
  for (let i = 0; i < locators.length; i += 1) {
    writeCentralFileHeader(writer, records[i], locators[i]);
  }
  const centralDirectoryLength = writer.index - centralDirectoryStart;

  const commentBytes = textEncoder.encode(comment);

  // Write central directory end.
  writeEndOfCentralDirectoryRecord(
    writer,
    records.length,
    centralDirectoryStart,
    centralDirectoryLength,
    commentBytes,
  );
}
