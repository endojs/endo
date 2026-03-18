/**
 * @param {any} err
 */
export const isShutdownSignal = err =>
  err?.message === 'SIGINT' ||
  err?.message === 'SIGTERM' ||
  err?.message === 'SIGQUIT';

/**
 * Returns true if the given error is a normal termination error.
 *
 * In which stacktrace(s) do not typically add any value.
 *
 * Just. Be. Normal. Damn.
 *
 * @param {any} err
 */
export const isTerminalError = err => (
  // some captp-internal form of normalcy
  err?.message === 'normal termination' ||

  // normal "user got impatient and killed us"
  isShutdownSignal(err)
);
// TODO or EPIPE, or EOF, or, ... other "boring" aka "normal" reasons that
// should not provoke a full stack trace
