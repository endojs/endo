// @ts-nocheck
/* global process */
// Buffer stdin until parent sends a message (any message).
process.once('message', () => {
  process.stdin.pipe(process.stdout);
});
// Inform parent that our message handler has been installed.
process.send({ type: 'ready' });
