// Host function aliases.
//
// Bundled JS code (bus-worker-xs.js, bus-daemon-rust-xs-powers.js)
// references host functions via `host<Name>` identifiers — e.g.
// `hostSendRawFrame`, `hostReadFile`, `hostGetDaemonHandle`. The
// Rust side registers them under bare names (`sendRawFrame`,
// `readFileText`, `getDaemonHandle`, ...) because that matches the
// xsnap unit tests and is nicer for ad-hoc evaluation.
//
// This shim runs after host-power registration and before the SES
// boot so that both naming styles resolve to the same function.
// It is an IIFE that writes to globalThis, so it works even after
// SES lockdown would normally freeze the globals — we evaluate it
// BEFORE lockdown.

(function () {
  var aliases = {
    // worker_io.rs
    hostGetDaemonHandle: 'getDaemonHandle',
    hostSendRawFrame: 'sendRawFrame',
    hostImportArchive: 'importArchive',
    hostTrace: 'trace',
    hostIssueCommand: 'issueCommand',
    hostRecvFrame: 'recvFrame',
    hostSendFrame: 'sendFrame',

    // powers/fs.rs
    hostReadFile: 'readFileText',
    hostWriteFile: 'writeFileText',
    hostReadDir: 'readDir',
    hostMkdir: 'mkdir',
    hostRemove: 'remove',
    hostRename: 'rename',
    hostExists: 'exists',
    hostIsDir: 'isDir',
    hostReadLink: 'readLink',

    // powers/process.rs
    hostGetPid: 'getPid',
    hostGetEnv: 'getEnv',
    hostJoinPath: 'joinPath',
    hostRealPath: 'realPath',

    // powers/sqlite.rs
    hostSqliteOpen: 'sqliteOpen',
    hostSqliteClose: 'sqliteClose',
    hostSqliteExec: 'sqliteExec',
    hostSqlitePrepare: 'sqlitePrepare',
    hostSqliteStmtRun: 'sqliteStmtRun',
    hostSqliteStmtGet: 'sqliteStmtGet',
    hostSqliteStmtAll: 'sqliteStmtAll',
    hostSqliteStmtColumns: 'sqliteStmtColumns',
    hostSqliteStmtFinalize: 'sqliteStmtFinalize',

    // powers/crypto.rs
    hostSha256: 'sha256',
    hostSha256Init: 'sha256Init',
    hostSha256Update: 'sha256Update',
    hostSha256UpdateBytes: 'sha256UpdateBytes',
    hostSha256Finish: 'sha256Finish',
    hostRandomHex256: 'randomHex256',
    hostEd25519Keygen: 'ed25519Keygen',
    hostEd25519Sign: 'ed25519Sign',
  };
  for (var key in aliases) {
    var target = globalThis[aliases[key]];
    if (typeof target === 'function') {
      globalThis[key] = target;
    }
  }
})();
