/**
 * Ambient declarations for host-injected globals available inside
 * XS bootstraps (bus-daemon-rust-xs.js, bus-xs-core.js,
 * bus-xs-daemon-polyfills.js, bus-worker-xs.js).  These symbols are
 * injected by the Rust supervisor and by polyfills.js.  Signatures
 * are intentionally permissive (`any`) because they sit at the FFI
 * boundary; the Rust side owns the contract, and tightening these
 * typings should be done alongside the Rust host function changes.
 */

declare var hostTrace: (...args: any[]) => any;
declare var hostSendRawFrame: (...args: any[]) => any;
declare var hostGetPid: (...args: any[]) => any;
declare var hostGetEnv: (...args: any[]) => any;
declare var hostDecodeUtf8: (...args: any[]) => any;
declare var hostReadFile: (...args: any[]) => any;
declare var hostReadFileBytes: (...args: any[]) => any;
declare var hostMaybeReadFileBytes: (...args: any[]) => any;
declare var hostWriteFile: (...args: any[]) => any;
declare var hostAppendFile: (...args: any[]) => any;
declare var hostStat: (...args: any[]) => any;
declare var hostReadDir: (...args: any[]) => any;
declare var hostReadLink: (...args: any[]) => any;
declare var hostMkdir: (...args: any[]) => any;
declare var hostRemove: (...args: any[]) => any;
declare var hostRename: (...args: any[]) => any;
declare var hostExists: (...args: any[]) => any;
declare var hostIsDir: (...args: any[]) => any;
declare var hostJoinPath: (...args: any[]) => any;
declare var hostRealPath: (...args: any[]) => any;
declare var hostSha256Init: (...args: any[]) => any;
declare var hostSha256Update: (...args: any[]) => any;
declare var hostSha256UpdateBytes: (...args: any[]) => any;
declare var hostSha256Finish: (...args: any[]) => any;
declare var hostRandomHex256: (...args: any[]) => any;
declare var hostEd25519Keygen: (...args: any[]) => any;
declare var hostEd25519Sign: (...args: any[]) => any;
declare var hostSqliteOpen: (...args: any[]) => any;
declare var hostSqliteClose: (...args: any[]) => any;
declare var hostSqliteExec: (...args: any[]) => any;
declare var hostSqlitePrepare: (...args: any[]) => any;
declare var hostSqliteStmtRun: (...args: any[]) => any;
declare var hostSqliteStmtGet: (...args: any[]) => any;
declare var hostSqliteStmtAll: (...args: any[]) => any;
declare var hostSqliteStmtColumns: (...args: any[]) => any;
declare var hostSqliteStmtFinalize: (...args: any[]) => any;

// Convenience wrappers installed by bus-xs-core / polyfills.
declare var trace: (...args: any[]) => any;
declare var sendRawFrame: (...args: any[]) => any;
declare var openWriter: (...args: any[]) => any;
declare var write: (...args: any[]) => any;
declare var closeWriter: (...args: any[]) => any;
