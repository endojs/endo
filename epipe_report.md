## Task `SES_UNHANDLED_REJECTION` during `endo stop` termination

While watching the endo daemon log and runngin `endo stop` we see:
```
SES_UNHANDLED_REJECTION: (Error#2)
Error#2: write EPIPE

  at Socket._writeGeneric (node:net:966:11)
  at Socket._write (node:net:978:8)
  at packages/stream-node/writer.js:64:21
  at Object.next (packages/stream-node/writer.js:62:9)
  at Object.next (packages/netstring/writer.js:47:18)
  at Object.next (packages/stream/index.js:227:21)
  at send (packages/daemon/src/connection.js:59:21)
  at CTP_DISCONNECT (packages/captp/src/captp.js:815:25)
  at dispatch (packages/captp/src/captp.js:863:7)
  at abort (packages/captp/src/captp.js:878:5)
  at close (packages/daemon/src/connection.js:122:5)
  at packages/daemon/src/connection.js:112:11
```

- [x] implement the "Fix Plan" investigated below
- [ ] be sure to commit your final work to git

### Investigation Findings

The `SES_UNHANDLED_REJECTION` error occurs due to a race condition during daemon shutdown:

1. **The Race Condition**: When running `endo stop`, the client closes its
   connection before processing the CapTP message `CTP_DISCONNECT`, but the
   daemon continues to attempt sending messages down the socket.

2. **Code Flow**:
   - `end stop` initiates graceful shutdown by closing the socket connection
   - The client sends `CTP_DISCONNECT` via CapTP
   - The daemon receives this message and queues it for processing
   - Simultaneously, the client stream closes, triggering `writer.return(undefined)` in `makeNodeWriter`
   - The daemon processes the queued `CTP_DISCONNECT` and attempts to send the response
   - Since the socket is already half-closed (client closed their end), the write fails with `EPIPE` (Broken Pipe)

3. **Root Cause**: In `packages/daemon/src/connection.js`, the `close` function
   waits for the `cancelled` promise, but the CapTP `abort` function can be
   triggered concurrently, leading to overlapping attempts to close/writer
   streams.

### Fix Plan

1. **Wrap error handling in writer.next()**: Add try-catch around the writer
   write operations in `makeNodeWriter` to suppress EPIPE errors that occur
   when the peer has already closed the connection.

2. **Add closing guard in connection.js**: After initiating the close
   operation, check if the writer stream has been finalized to avoid redundant
   write attempts.

3. **Make writer errors non-critical**: In the callback passed to
   `writer.write()`, ensure rejected promises are handled gracefully to prevent
   them from propagating as unhandled rejections.

### Implementation

```javascript
// In packages/stream-node/writer.js, modify writer.write callback:

writer.write(value, err => {
  if (err) {
    // Check if this is an EPIPE error (peer closed)
    if (err.code === 'EPIPE' || err.code === 'ERR_STREAM_PREMATURE_CLOSE') {
      return;
    }
    reject(err);
  }
});
```

```javascript
// In packages/daemon/src/connection.js, add finalization check:

async close(reason) {
  // Mark as closing to prevent new messages
  this.closing = true;

  // Cancel the CapTP stream
  await this.capTP.abort(reason);

  // Close the writer stream, handling EPIPE gracefully
  try {
    await this.writer.return(undefined);
  } catch (e) {
    if (e.code === 'EPIPE' || e.code === 'ERR_STREAM_PREMATURE_CLOSE') {
      // Peer already closed, this is expected
    }
  }

  // Await connection closed
  await this.closed;
}
```
