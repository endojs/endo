// @ts-check

import { M } from '@endo/patterns';

/**
 * Interface guard for the {@link ShellProcess} exo returned by the
 * host-shell formula.  The three stream accessors return exo-stream
 * byte-stream references (a `PassableBytesWriter` for stdin,
 * `PassableBytesReader`s for stdout / stderr); `exit` resolves the
 * process's terminal status.
 *
 * Stream accessors are idempotent — each returns the same cached
 * reference every call, because a child's stdio pipe has a single
 * consumer / producer.
 */
export const ShellProcessInterface = M.interface('ShellProcess', {
  // The remote initiator drains these with @endo/exo-stream's
  // iterateBytesReader / iterateBytesWriter.
  stdin: M.call().returns(M.remotable('PassableBytesWriter')),
  stdout: M.call().returns(M.remotable('PassableBytesReader')),
  stderr: M.call().returns(M.remotable('PassableBytesReader')),
  // Resolves { code, signal } once the process and its stdio have closed.
  exit: M.call().returns(M.promise()),
  // Send a POSIX signal (default SIGTERM); reports whether it was delivered.
  kill: M.call().optional(M.or(M.string(), M.number())).returns(M.boolean()),
  // The OS process id, or undefined if the process failed to spawn.
  pid: M.call().returns(M.opt(M.number())),
  help: M.call().returns(M.string()),
});
harden(ShellProcessInterface);
