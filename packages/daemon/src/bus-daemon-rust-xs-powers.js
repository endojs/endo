// @ts-check
/* global hostReadFile, hostWriteFile, hostReadDir, hostMkdir, hostRemove,
   hostRename, hostExists, hostIsDir, hostReadLink, hostSha256, hostSha256Init,
   hostSha256Update, hostSha256UpdateBytes, hostSha256Finish, hostRandomHex256,
   hostEd25519Keygen, hostEd25519Sign, hostGetPid, hostGetEnv, hostJoinPath,
   hostRealPath, openWriter, write, closeWriter,
   hostSqliteOpen, hostSqliteClose, hostSqliteExec, hostSqlitePrepare,
   hostSqliteStmtRun, hostSqliteStmtGet, hostSqliteStmtAll,
   hostSqliteStmtColumns, hostSqliteStmtFinalize, harden */

/**
 * XS daemon powers — factory functions that create FilePowers and
 * CryptoPowers backed by Rust host functions instead of Node.js modules.
 *
 * These are the XS equivalents of makeFilePowers() and makeCryptoPowers()
 * from daemon-node-powers.js.
 */

/** @import { CryptoPowers, FilePowers } from './types.js' */

const textEncoder = new TextEncoder();

/**
 * Convert a Uint8Array to a hex string.
 *
 * @param {Uint8Array} bytes
 * @returns {string}
 */
const toHex = bytes => {
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
};

/**
 * Convert a hex string to a Uint8Array.
 *
 * @param {string} hex
 * @returns {Uint8Array}
 */
const fromHex = hex => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
};

/**
 * Create FilePowers backed by XS host functions.
 *
 * Host functions operate on cap-std Dir handles identified by string
 * tokens (e.g., "state", "ephemeral", "cache"). For the daemon, we
 * use absolute paths — the host functions accept a "root" dir token
 * and paths relative to the filesystem root.
 *
 * @returns {FilePowers}
 */
export const makeXsFilePowers = () => {
  // The "root" directory token maps to "/" in the Rust HostPowers.
  // All daemon paths are absolute, so we strip the leading "/" and
  // pass the remainder as a relative path under the root dir.
  const DIR_TOKEN = 'root';

  /**
   * @param {string} path
   * @returns {string}
   */
  const toRelative = path => {
    if (path.startsWith('/')) {
      return path.slice(1);
    }
    return path;
  };

  /** @type {FilePowers['writeFileText']} */
  const writeFileText = async (path, text) => {
    const result = hostWriteFile(DIR_TOKEN, toRelative(path), text);
    if (typeof result === 'string' && result.startsWith('Error: ')) {
      throw new Error(result);
    }
  };

  /** @type {FilePowers['readFileText']} */
  const readFileText = async path => {
    const result = hostReadFile(DIR_TOKEN, toRelative(path));
    if (typeof result === 'string' && result.startsWith('Error: ')) {
      throw new Error(result);
    }
    return result;
  };

  /** @type {FilePowers['maybeReadFileText']} */
  const maybeReadFileText = async path => {
    const result = hostReadFile(DIR_TOKEN, toRelative(path));
    if (typeof result === 'string' && result.startsWith('Error: ')) {
      // ENOENT or EISDIR → return undefined, otherwise throw.
      if (
        result.includes('No such file') ||
        result.includes('ENOENT') ||
        result.includes('Is a directory') ||
        result.includes('EISDIR') ||
        result.includes('not found') ||
        result.includes('NotFound')
      ) {
        return undefined;
      }
      throw new Error(result);
    }
    return result;
  };

  /** @type {FilePowers['readDirectory']} */
  const readDirectory = async path => {
    const result = hostReadDir(DIR_TOKEN, toRelative(path));
    if (typeof result === 'string' && result.startsWith('Error: ')) {
      throw new Error(result);
    }
    return JSON.parse(result);
  };

  /** @type {FilePowers['makePath']} */
  const makePath = async path => {
    const result = hostMkdir(DIR_TOKEN, toRelative(path));
    if (typeof result === 'string' && result.startsWith('Error: ')) {
      throw new Error(result);
    }
  };

  /** @type {FilePowers['removePath']} */
  const removePath = async path => {
    const result = hostRemove(DIR_TOKEN, toRelative(path));
    if (typeof result === 'string' && result.startsWith('Error: ')) {
      throw new Error(result);
    }
  };

  /** @type {FilePowers['renamePath']} */
  const renamePath = async (source, target) => {
    const result = hostRename(DIR_TOKEN, toRelative(source), toRelative(target));
    if (typeof result === 'string' && result.startsWith('Error: ')) {
      throw new Error(result);
    }
  };

  /** @type {FilePowers['joinPath']} */
  const joinPath = (...components) => hostJoinPath(...components);

  /** @type {FilePowers['realPath']} */
  const realPath = async path => {
    const result = hostRealPath(DIR_TOKEN, toRelative(path));
    if (typeof result === 'string' && result.startsWith('Error: ')) {
      throw new Error(result);
    }
    return result;
  };

  /** @type {FilePowers['readLink']} */
  const readLink = async path => {
    const result = hostReadLink(DIR_TOKEN, toRelative(path));
    // Returns undefined if not a symlink, otherwise the target string.
    return result;
  };

  /** @type {FilePowers['isDirectory']} */
  const isDirectory = async path =>
    hostIsDir(DIR_TOKEN, toRelative(path));

  /** @type {FilePowers['exists']} */
  const exists = async path =>
    hostExists(DIR_TOKEN, toRelative(path));

  /**
   * In-memory file reader for content store.
   * Reads the entire file and returns it as a single-chunk async iterable.
   *
   * @param {string} path
   * @returns {import('@endo/stream').Reader<Uint8Array>}
   */
  const makeFileReader = path => {
    let consumed = false;
    return harden({
      async next() {
        if (consumed) {
          return harden({ done: true, value: undefined });
        }
        consumed = true;
        const text = await readFileText(path);
        return harden({
          done: false,
          value: textEncoder.encode(text),
        });
      },
      async return(_value) {
        consumed = true;
        return harden({ done: true, value: undefined });
      },
      async throw(_error) {
        consumed = true;
        return harden({ done: true, value: undefined });
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    });
  };

  /**
   * In-memory file writer for content store.
   * Collects all chunks and writes atomically on return().
   *
   * @param {string} path
   * @returns {import('@endo/stream').Writer<Uint8Array>}
   */
  const makeFileWriter = path => {
    const handle = openWriter(DIR_TOKEN, toRelative(path));
    return harden({
      async next(/** @type {Uint8Array} */ chunk) {
        write(handle, chunk);
        return harden({ done: false, value: undefined });
      },
      async return(_value) {
        closeWriter(handle);
        return harden({ done: true, value: undefined });
      },
      async throw(_error) {
        closeWriter(handle);
        return harden({ done: true, value: undefined });
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    });
  };

  return harden({
    makeFileReader,
    makeFileWriter,
    writeFileText,
    readFileText,
    maybeReadFileText,
    readDirectory,
    makePath,
    joinPath,
    removePath,
    renamePath,
    realPath,
    readLink,
    isDirectory,
    exists,
  });
};
harden(makeXsFilePowers);

/**
 * Create CryptoPowers backed by XS host functions.
 *
 * @returns {CryptoPowers}
 */
export const makeXsCryptoPowers = () => {
  const makeSha256 = () => {
    const handle = hostSha256Init();
    return harden({
      /** @param {Uint8Array} chunk */
      update: chunk => {
        hostSha256UpdateBytes(handle, chunk);
      },
      /** @param {string} chunk */
      updateText: chunk => {
        hostSha256Update(handle, chunk);
      },
      digestHex: () => hostSha256Finish(handle),
    });
  };

  /** @returns {Promise<string>} */
  const randomHex256 = async () => hostRandomHex256();

  const generateEd25519Keypair = async () => {
    const json = hostEd25519Keygen();
    const { publicKey: pubHex, privateKey: privHex } = JSON.parse(json);
    // Store keys as hex strings internally and convert to Uint8Array
    // via getters. Uint8Array instances cannot be frozen in XS (their
    // indexed properties are non-configurable), so we must not include
    // them directly in a hardened object.
    const keypair = {
      get publicKey() {
        return fromHex(pubHex);
      },
      get privateKey() {
        return fromHex(privHex);
      },
      /** @param {Uint8Array} message */
      sign: message => {
        const sigHex = hostEd25519Sign(privHex, toHex(message));
        return fromHex(sigHex);
      },
    };
    return harden(keypair);
  };

  /**
   * @param {Uint8Array} privateKey
   * @param {Uint8Array} message
   * @returns {Uint8Array}
   */
  const ed25519Sign = (privateKey, message) => {
    const sigHex = hostEd25519Sign(toHex(privateKey), toHex(message));
    return fromHex(sigHex);
  };

  return harden({
    makeSha256,
    randomHex256,
    generateEd25519Keypair,
    ed25519Sign,
  });
};
harden(makeXsCryptoPowers);

// ---------------------------------------------------------------------------
// SQLite
// ---------------------------------------------------------------------------

/** @import { SqlitePowers } from './types.js' */

/**
 * Base64 encode a Uint8Array for FFI transport.
 *
 * @param {Uint8Array} bytes
 * @returns {string}
 */
const toBase64 = bytes => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

/**
 * Base64 decode a string to Uint8Array.
 *
 * @param {string} str
 * @returns {Uint8Array}
 */
const fromBase64 = str => {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

/**
 * Encode a single JS param value for FFI JSON transport.
 * bigint → {$bigint: string}, Uint8Array → {$bytes: base64}.
 *
 * @param {import('./types.js').SqliteValue} value
 * @returns {unknown}
 */
const encodeValue = value => {
  if (typeof value === 'bigint') {
    return { $bigint: String(value) };
  }
  if (value instanceof Uint8Array) {
    return { $bytes: toBase64(value) };
  }
  return value;
};

/**
 * Decode a single FFI JSON result value back to JS.
 * {$bigint: string} → bigint, {$bytes: base64} → Uint8Array.
 *
 * @param {unknown} value
 * @returns {import('./types.js').SqliteValue}
 */
const decodeValue = value => {
  if (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  ) {
    const obj = /** @type {Record<string, unknown>} */ (value);
    if ('$bigint' in obj) {
      return BigInt(/** @type {string} */ (obj.$bigint));
    }
    if ('$bytes' in obj) {
      return fromBase64(/** @type {string} */ (obj.$bytes));
    }
  }
  return /** @type {import('./types.js').SqliteValue} */ (value);
};

/**
 * Decode all values in a row object from FFI tags to native types.
 *
 * @param {Record<string, unknown>} row
 * @returns {Record<string, import('./types.js').SqliteValue>}
 */
const decodeRow = row => {
  /** @type {Record<string, import('./types.js').SqliteValue>} */
  const result = {};
  for (const key of Object.keys(row)) {
    result[key] = decodeValue(row[key]);
  }
  return harden(result);
};

/**
 * Assert that a host function result is not an error string.
 *
 * @param {unknown} result
 */
const assertSqliteOk = result => {
  if (typeof result === 'string' && result.startsWith('Error: ')) {
    throw new Error(result.slice(7));
  }
};

/**
 * Create SqlitePowers backed by XS host functions.
 *
 * @returns {SqlitePowers}
 */
export const makeXsSqlitePowers = () => {
  /** @type {SqlitePowers['openDatabase']} */
  const openDatabase = path => {
    const dbHandle = hostSqliteOpen(path);
    assertSqliteOk(dbHandle);

    let isOpen = true;

    const close = () => {
      if (isOpen) {
        hostSqliteClose(dbHandle);
        isOpen = false;
      }
    };

    /** @param {string} sql */
    const exec = sql => {
      const result = hostSqliteExec(dbHandle, sql);
      assertSqliteOk(result);
    };

    /** @param {string} sql */
    const prepare = sql => {
      const stmtHandle = hostSqlitePrepare(dbHandle, sql);
      assertSqliteOk(stmtHandle);

      /**
       * @param {import('./types.js').SqliteValue[]} args
       * @returns {string}
       */
      const encodeParams = args => {
        if (
          args.length === 1 &&
          typeof args[0] === 'object' &&
          args[0] !== null &&
          !Array.isArray(args[0]) &&
          !(args[0] instanceof Uint8Array)
        ) {
          // Named parameters — encode each value.
          const obj = /** @type {Record<string, import('./types.js').SqliteValue>} */ (
            args[0]
          );
          /** @type {Record<string, unknown>} */
          const encoded = {};
          for (const key of Object.keys(obj)) {
            encoded[key] = encodeValue(
              /** @type {import('./types.js').SqliteValue} */ (obj[key]),
            );
          }
          return JSON.stringify(encoded);
        }
        return JSON.stringify(args.map(encodeValue));
      };

      /** @type {import('./types.js').StatementSync['run']} */
      const run = (...params) => {
        const result = hostSqliteStmtRun(stmtHandle, encodeParams(params));
        assertSqliteOk(result);
        const parsed = JSON.parse(/** @type {string} */ (result));
        return harden({
          changes: BigInt(parsed.changes),
          lastInsertRowid: BigInt(parsed.lastInsertRowid),
        });
      };

      /** @type {import('./types.js').StatementSync['get']} */
      const get = (...params) => {
        const result = hostSqliteStmtGet(stmtHandle, encodeParams(params));
        assertSqliteOk(result);
        const parsed = JSON.parse(/** @type {string} */ (result));
        if (parsed === null) {
          return undefined;
        }
        return decodeRow(parsed);
      };

      /** @type {import('./types.js').StatementSync['all']} */
      const all = (...params) => {
        const result = hostSqliteStmtAll(stmtHandle, encodeParams(params));
        assertSqliteOk(result);
        const parsed = JSON.parse(/** @type {string} */ (result));
        return harden(parsed.map(decodeRow));
      };

      /** @type {import('./types.js').StatementSync['columns']} */
      const columns = () => {
        const result = hostSqliteStmtColumns(stmtHandle);
        assertSqliteOk(result);
        return harden(JSON.parse(/** @type {string} */ (result)));
      };

      const finalize = () => {
        hostSqliteStmtFinalize(stmtHandle);
      };

      return harden({ run, get, all, columns, finalize });
    };

    return harden({
      close,
      exec,
      prepare,
      get open() {
        return isOpen;
      },
    });
  };

  return harden({ openDatabase });
};
harden(makeXsSqlitePowers);
