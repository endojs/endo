// @ts-check
/* eslint no-bitwise: ["off"] */

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
 *   writeUint16LE: (number: number) => void,
 *   writeUint32LE: (number: number) => void,
 * }} BufferWriter
 */

import "./types";
import { crc32 } from "./crc32";
import * as signature from "./signature";
import * as compression from "./compression";

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
  writer.writeUint32LE(dosTime);
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
  writer.writeUint16LE(10);
  writer.writeUint16LE(file.bitFlag);
  writer.write(textEncoder.encode(file.compressionMethod));
  writeDosDateTime(writer, file.date);
  writer.writeUint32LE(file.crc32);
  writer.writeUint32LE(file.compressedLength);
  writer.writeUint32LE(file.uncompressedLength);
  writer.writeUint16LE(file.name.length);
  const headerEnd = writer.length;

  // TODO count of extra fields length
  writer.writeUint16LE(0);
  writer.write(file.name);
  // TODO write extra fields
  writer.write(file.content);

  return {
    fileStart,
    headerStart,
    headerEnd
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
  writer.writeUint16LE(0);
  writer.writeUint16LE(file.comment.length);
  writer.writeUint16LE(file.diskNumberStart);
  writer.writeUint16LE(file.internalFileAttributes);
  writer.writeUint32LE(file.externalFileAttributes);
  writer.writeUint32LE(locator.fileStart);
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
  commentBytes
) {
  writer.write(signature.CENTRAL_DIRECTORY_END);
  writer.writeUint16LE(0);
  writer.writeUint16LE(0);
  writer.writeUint16LE(entriesCount);
  writer.writeUint16LE(entriesCount);
  writer.writeUint32LE(centralDirectoryLength);
  writer.writeUint32LE(centralDirectoryStart);
  writer.writeUint16LE(commentBytes.length);
  writer.write(commentBytes);
}

/**
 * @param {BufferWriter} writer
 * @param {Array<FileRecord>} records
 * @param {string} comment
 */
export function writeZipRecords(writer, records, comment = "") {
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
    commentBytes
  );
}

/**
 * @param {ArchivedFile} file
 * @returns {UncompressedFile}
 */
function encodeFile(file) {
  const name = textEncoder.encode(file.name.replace(/\\/g, "/"));
  const comment = textEncoder.encode(file.comment);
  return {
    name,
    mode: file.mode,
    date: file.date,
    content: file.content,
    comment
  };
}

/**
 * @param {UncompressedFile} file
 * @returns {CompressedFile}
 */
function compressFileWithStore(file) {
  return {
    name: file.name,
    mode: file.mode,
    date: file.date,
    crc32: crc32(file.content),
    compressionMethod: compression.STORE,
    compressedLength: file.content.length,
    uncompressedLength: file.content.length,
    content: file.content,
    comment: file.comment
  };
}

/**
 * Computes Zip external file attributes field from a UNIX mode for a file.
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
 * @param {CompressedFile} file
 * @returns {FileRecord}
 */
function makeFileRecord(file) {
  return {
    name: file.name,
    centralName: file.name,
    madeBy: UNIX,
    version: UNIX_VERSION,
    versionNeeded: 0, // TODO this is probably too lax.
    bitFlag: 0,
    compressionMethod: compression.STORE,
    date: file.date,
    crc32: file.crc32,
    compressedLength: file.compressedLength,
    uncompressedLength: file.uncompressedLength,
    diskNumberStart: 0,
    internalFileAttributes: 0,
    externalFileAttributes: externalFileAttributes(file.mode),
    comment: file.comment,
    content: file.content
  };
}

/**
 * @param {BufferWriter} writer
 * @param {Array<ArchivedFile>} files
 * @param {string} comment
 */
export function writeZip(writer, files, comment = "") {
  const encodedFiles = files.map(encodeFile);
  const compressedFiles = encodedFiles.map(compressFileWithStore);
  // TODO collate directoryRecords from file bases.
  const fileRecords = compressedFiles.map(makeFileRecord);
  writeZipRecords(writer, fileRecords, comment);
}
