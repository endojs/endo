// @ts-check
/* eslint no-bitwise: ["off"], max-lines: ["off"] */

/**
 * @typedef {import('./types.js').ArchiveHeaders} ArchiveHeaders
 * @typedef {import('./types.js').CompressedFile} CompressedFile
 * @typedef {import('./types.js').UncompressedFile} UncompressedFile
 * @typedef {import('./types.js').ArchivedFile} ArchivedFile
 *
 * @typedef {{
 *   name: Uint8Array,
 *   version: number,
 *   madeBy: number,
 *   fileStart: number,
 *   diskNumberStart: number,
 *   internalFileAttributes: number,
 *   externalFileAttributes: number,
 *   comment: Uint8Array
 * } & ArchiveHeaders} CentralFileRecord
 *
 * @typedef {{
 *   name: Uint8Array,
 *   content: Uint8Array,
 * } & ArchiveHeaders} LocalFileRecord
 *
 * @typedef {{
 *  diskNumber: number,
 *  diskWithCentralDirStart: number,
 *  centralDirectoryRecordsOnThisDisk: number,
 *  centralDirectoryRecords: number,
 *  centralDirectorySize: number,
 *  centralDirectoryOffset: number
 *  comment: string
 * }} CentralDirectoryLocator
 *
 * @typedef {{
 *   readonly length: number,
 *   offset: number,
 *   read: (size: number) => Uint8Array,
 *   skip: (size: number) => void,
 *   seek: (index: number) => void,
 *   expect: (bytes: Uint8Array) => boolean,
 *   readUint8: () => number,
 *   readUint16: (littleEndian?: boolean) => number,
 *   readUint32: (littleEndian?: boolean) => number,
 * }} BufferReader
 */

import './types.js';
import { crc32 } from './crc32.js';
import * as signature from './signature.js';
import * as compression from './compression.js';

// q, as in quote, for quoting strings in errors
const q = JSON.stringify;

const MAX_VALUE_16BITS = 65535;
const MAX_VALUE_32BITS = 4294967295;

const textDecoder = new TextDecoder();

/**
 * @param {number} bitFlag
 * @returns {boolean}
 */
function isEncrypted(bitFlag) {
  return (bitFlag & 0x0001) === 0x0001;
}

/**
 * @param {BufferReader} reader
 * @returns {Date}
 * @see http://www.delorie.com/djgpp/doc/rbinter/it/65/16.html
 * @see http://www.delorie.com/djgpp/doc/rbinter/it/66/16.html
 */
function readDosDateTime(reader) {
  const dosTime = reader.readUint32(true);
  return new Date(
    Date.UTC(
      ((dosTime >> 25) & 0x7f) + 1980, // year
      ((dosTime >> 21) & 0x0f) - 1, // month
      (dosTime >> 16) & 0x1f, // day
      (dosTime >> 11) & 0x1f, // hour
      (dosTime >> 5) & 0x3f, // minute
      (dosTime & 0x1f) << 1, // second
    ),
  );
}

/**
 * @param {BufferReader} reader
 * @returns {ArchiveHeaders}
 */
function readHeaders(reader) {
  return {
    versionNeeded: reader.readUint16(true),
    bitFlag: reader.readUint16(true),
    compressionMethod: reader.readUint16(true),
    date: readDosDateTime(reader),
    crc32: reader.readUint32(true),
    compressedLength: reader.readUint32(true),
    uncompressedLength: reader.readUint32(true),
  };
}

/**
 * @param {BufferReader} reader
 * @returns {CentralFileRecord}
 */
function readCentralFileHeader(reader) {
  const version = reader.readUint8();
  const madeBy = reader.readUint8();
  const headers = readHeaders(reader);
  const nameLength = reader.readUint16(true);
  const extraFieldsLength = reader.readUint16(true);
  const commentLength = reader.readUint16(true);
  const diskNumberStart = reader.readUint16(true);
  const internalFileAttributes = reader.readUint16(true);
  const externalFileAttributes = reader.readUint32(true);
  const fileStart = reader.readUint32(true);

  const name = reader.read(nameLength);
  // TODO read extra fields, particularly Zip64
  reader.skip(extraFieldsLength);

  if (headers.uncompressedLength === MAX_VALUE_32BITS) {
    throw Error('Cannot read Zip64');
  }
  if (headers.compressedLength === MAX_VALUE_32BITS) {
    throw Error('Cannot read Zip64');
  }
  if (fileStart === MAX_VALUE_32BITS) {
    throw Error('Cannot read Zip64');
  }
  if (diskNumberStart === MAX_VALUE_32BITS) {
    throw Error('Cannot read Zip64');
  }

  const comment = reader.read(commentLength);

  return {
    name,
    version,
    madeBy,
    ...headers,
    diskNumberStart,
    internalFileAttributes,
    externalFileAttributes,
    fileStart,
    comment,
  };
}

/**
 * @param {BufferReader} reader
 * @param {CentralDirectoryLocator} locator
 * @returns {Array<CentralFileRecord>}
 */
function readCentralDirectory(reader, locator) {
  const { centralDirectoryOffset, centralDirectoryRecords } = locator;
  reader.seek(centralDirectoryOffset);

  const entries = [];
  while (reader.expect(signature.CENTRAL_FILE_HEADER)) {
    const entry = readCentralFileHeader(reader);
    entries.push(entry);
  }

  if (centralDirectoryRecords !== entries.length) {
    // We expected some records but couldn't find ANY.
    // This is really suspicious, as if something went wrong.
    throw Error(
      `Corrupted zip or bug: expected ${centralDirectoryRecords} records in central dir, got ${entries.length}`,
    );
  }

  return entries;
}

/**
 * @param {BufferReader} reader
 * @returns {LocalFileRecord}
 */
function readFile(reader) {
  reader.expect(signature.LOCAL_FILE_HEADER);
  const headers = readHeaders(reader);
  const nameLength = reader.readUint16(true);
  const extraFieldsLength = reader.readUint16(true);
  const name = reader.read(nameLength);
  reader.skip(extraFieldsLength);
  const content = reader.read(headers.compressedLength);
  return { name, ...headers, content };
}

/**
 * @param {BufferReader} reader
 * @param {Array<CentralFileRecord>} records
 * @returns {Array<LocalFileRecord>}
 */
function readLocalFiles(reader, records) {
  const files = [];
  for (const record of records) {
    reader.seek(record.fileStart);
    const file = readFile(reader);
    files.push(file);
  }
  return files;
}

/**
 * @param {BufferReader} reader
 * @returns {CentralDirectoryLocator}
 */
function readBlockEndOfCentral(reader) {
  if (!reader.expect(signature.CENTRAL_DIRECTORY_END)) {
    throw Error(
      'Corrupt zip file, or zip file containing an unsupported variable-width end-of-archive comment, or an unsupported zip file with 64 bit sizes',
    );
  }
  const diskNumber = reader.readUint16(true);
  const diskWithCentralDirStart = reader.readUint16(true);
  const centralDirectoryRecordsOnThisDisk = reader.readUint16(true);
  const centralDirectoryRecords = reader.readUint16(true);
  const centralDirectorySize = reader.readUint32(true);
  const centralDirectoryOffset = reader.readUint32(true);
  const commentLength = reader.readUint16(true);
  // Warning: the encoding depends of the system locale.
  // On a Linux machine with LANG=en_US.utf8, this field is utf8 encoded.
  // On a Windows machine, this field is encoded with the localized Windows
  // code page.
  const comment = textDecoder.decode(reader.read(commentLength));
  return {
    diskNumber,
    diskWithCentralDirStart,
    centralDirectoryRecordsOnThisDisk,
    centralDirectoryRecords,
    centralDirectorySize,
    centralDirectoryOffset,
    comment,
  };
}

/**
 * @param {BufferReader} reader
 * @returns {CentralDirectoryLocator}
 */
function readEndOfCentralDirectoryRecord(reader) {
  // Zip files are permitted to have a variable-width comment at the end of the
  // "end of central directory record" and may have subsequent Zip64 headers.
  // The prescribed method of finding the beginning of the "end of central
  // directory record" is to seek the magic number:
  //
  //   reader.findLast(signature.CENTRAL_DIRECTORY_END);
  //
  // This introduces a number of undesirable, attackable ambiguities
  // Agoric is not comfortable supporting, so we forbid the comment
  // and 64 bit zip support so we can seek a predictable length
  // from the end.
  const centralDirectoryEnd = reader.length - 22;
  if (centralDirectoryEnd < 0) {
    throw Error('Corrupted zip: not enough content');
  }
  reader.seek(centralDirectoryEnd);
  const locator = readBlockEndOfCentral(reader);

  // Excerpt from the zip spec:
  //   4)  If one of the fields in the end of central directory
  //       record is too small to hold required data, the field
  //       should be set to -1 (0xFFFF or 0xFFFFFFFF) and the
  //       ZIP64 format record should be created.
  //   5)  The end of central directory record and the
  //       Zip64 end of central directory locator record must
  //       reside on the same disk when splitting or spanning
  //       an archive.
  const zip64 =
    locator.diskNumber === MAX_VALUE_16BITS ||
    locator.diskWithCentralDirStart === MAX_VALUE_16BITS ||
    locator.centralDirectoryRecordsOnThisDisk === MAX_VALUE_16BITS ||
    locator.centralDirectoryRecords === MAX_VALUE_16BITS ||
    locator.centralDirectorySize === MAX_VALUE_32BITS ||
    locator.centralDirectoryOffset === MAX_VALUE_32BITS;

  if (zip64) {
    throw Error('Cannot read Zip64');
  }

  const {
    centralDirectoryOffset,
    centralDirectorySize,
    // zip64EndOfCentralSize
  } = locator;

  const expectedCentralDirectoryEnd =
    centralDirectoryOffset + centralDirectorySize;
  const extraBytes = centralDirectoryEnd - expectedCentralDirectoryEnd;

  reader.offset = extraBytes;

  return locator;
}

/**
 * @param {CentralFileRecord} centralRecord
 * @param {LocalFileRecord} localRecord
 * @param {string} archiveName
 */
function checkRecords(centralRecord, localRecord, archiveName) {
  const centralName = textDecoder.decode(centralRecord.name);
  const localName = textDecoder.decode(localRecord.name);

  // In some zip files created on Windows, the filename stored in the central
  // dir contains "\" instead of "/".  Strangely, the file name in the local
  // directory uses "/" as specified:
  // http://www.info-zip.org/FAQ.html#backslashes or APPNOTE#4.4.17.1, "All
  // slashes MUST be forward slashes '/'") but there are a lot of bad zip
  // generators...  Search "unzip mismatching "local" filename continuing with
  // "central" filename version".
  //
  // The reasoning appears to be that the central directory is for
  // user display and may differ, though this opens the possibility
  // for spoofing attacks.
  // http://seclists.org/fulldisclosure/2009/Sep/394
  //
  // We strike a compromise: the central directory name may vary from the local
  // name exactly and only by different slashes.
  if (centralName.replace(/\\/g, '/') !== localName) {
    throw Error(
      `Zip integrity error: central record file name ${q(
        centralName,
      )} must match local file name ${q(localName)} in archive ${q(
        archiveName,
      )}`,
    );
  }

  /**
   * @param {boolean} value
   * @param {string} message
   */
  function check(value, message) {
    if (!value) {
      throw Error(
        `Zip integrity error: ${message} for file ${q(
          localName,
        )} in archive ${q(archiveName)}`,
      );
    }
  }

  check(
    centralRecord.bitFlag === localRecord.bitFlag,
    `Central record bit flag ${centralRecord.bitFlag.toString(
      16,
    )} must match local record bit flag ${localRecord.bitFlag.toString(16)}`,
  );
  check(
    centralRecord.compressionMethod === localRecord.compressionMethod,
    `Central record compression method ${q(
      centralRecord.compressionMethod,
    )} must match local compression method ${q(localRecord.compressionMethod)}`,
  );
  // TODO Date integrity check would be easier on the original bytes.
  // Perhaps defer decoding the underlying bytes.
  check(
    centralRecord.crc32 === localRecord.crc32,
    `Central record CRC-32 checksum ${centralRecord.crc32} must match local checksum ${localRecord.crc32}`,
  );
  check(
    centralRecord.compressedLength === localRecord.compressedLength,
    `Central record compressed size ${centralRecord.compressedLength} must match local ${localRecord.compressedLength}`,
  );
  check(
    centralRecord.uncompressedLength === localRecord.uncompressedLength,
    `Central record uncompressed size ${centralRecord.uncompressedLength} must match local ${localRecord.uncompressedLength}`,
  );

  const checksum = crc32(localRecord.content);
  check(
    checksum === localRecord.crc32,
    `CRC-32 checksum mismatch, wanted ${localRecord.crc32} but actual content is ${checksum}`,
  );
}

/**
 * @param {number} externalFileAttributes
 */
function modeForExternalAttributes(externalFileAttributes) {
  return (externalFileAttributes >> 16) & 0xffff;
}

/**
 * @param {CentralFileRecord} centralRecord
 * @param {LocalFileRecord} localRecord
 * @returns {CompressedFile}
 */
function recordToFile(centralRecord, localRecord) {
  const mode = modeForExternalAttributes(centralRecord.externalFileAttributes);
  return {
    name: centralRecord.name,
    mode,
    date: centralRecord.date,
    crc32: centralRecord.crc32,
    compressionMethod: centralRecord.compressionMethod,
    compressedLength: centralRecord.compressedLength,
    uncompressedLength: centralRecord.uncompressedLength,
    content: localRecord.content,
    comment: centralRecord.comment,
  };
}

/**
 * @param {CompressedFile} file
 * @returns {UncompressedFile}
 */
function decompressFile(file) {
  if (file.compressionMethod !== compression.STORE) {
    throw Error(
      `Cannot find decompressor for compression method ${q(
        file.compressionMethod,
      )} for file ${file.name}`,
    );
  }
  return {
    name: file.name,
    mode: file.mode,
    date: file.date,
    content: file.content,
    comment: file.comment,
  };
}

/**
 * @param {UncompressedFile} file
 * @returns {ArchivedFile}
 */
function decodeFile(file) {
  const name = textDecoder.decode(file.name);
  const comment = textDecoder.decode(file.comment);
  return {
    name,
    type: 'file',
    mode: file.mode & 0o777,
    date: file.date,
    content: file.content,
    comment,
  };
}

/**
 * @param {BufferReader} reader
 * @param {string} name
 */
export function readZip(reader, name = '<unknown>') {
  const locator = readEndOfCentralDirectoryRecord(reader);
  const centralRecords = readCentralDirectory(reader, locator);
  const localRecords = readLocalFiles(reader, centralRecords);
  const files = new Map();

  for (let i = 0; i < centralRecords.length; i += 1) {
    const centralRecord = centralRecords[i];
    const localRecord = localRecords[i];

    checkRecords(centralRecord, localRecord, name);

    if (isEncrypted(centralRecord.bitFlag)) {
      throw Error('Encrypted zip are not supported');
    }

    const isDir = (centralRecord.externalFileAttributes & 0x0010) !== 0;
    if (!isDir) {
      const compressedFile = recordToFile(centralRecord, localRecord);
      const decompressedFile = decompressFile(compressedFile);
      const decodedFile = decodeFile(decompressedFile);
      files.set(decodedFile.name, decodedFile);
    }
    // TODO handle explicit directory entries
  }
  return files;
}
