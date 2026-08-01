// @ts-check
/* global setInterval, clearInterval, setTimeout, clearTimeout */

import harden from '@endo/harden';

// iroh's QUIC stack closes a connection after its default max idle timeout
// (~30 seconds with the current binding) and @number0/iroh's
// `EndpointOptions` exposes no transport
// config to shorten that or to enable QUIC-level keep-alive. A quiet but
// healthy CapTP session (two peers that have swapped bootstrap references
// and are each awaiting the other) would therefore be torn down. The
// heartbeat emits a small QUIC datagram on an interval to keep the
// connection from going idle, and presumes the peer dead if it falls
// silent for a full keep-alive window (twice the heartbeat interval, so a
// single dropped beat is tolerated), tearing the session down promptly
// instead of waiting on the opaque QUIC idle timeout.
//
// QUIC DATAGRAM frames are ack-eliciting and travel out-of-band from the
// CapTP bi-stream, so a heartbeat resets both endpoints' idle timers (RFC
// 9000 sec. 10.1) without disturbing the netstring frames the OCapN reader
// and writer share. Both peers run this module, so datagrams flow in both
// directions and each side's watchdog observes the other's liveness.
//
// The watchdog is armed lazily, by the peer's first inbound datagram, not
// at connection start. A peer that never heartbeats is therefore not
// presumed dead here; its connection falls back to iroh's QUIC idle
// timeout. Only a peer that has demonstrably heartbeated and then stopped
// is torn down at the keep-alive window.
//
// Mirrors the daemon's `packages/daemon/src/networks/iroh-heartbeat.js`.

/**
 * Heartbeat send period. Comfortably below iroh's QUIC idle timeout so a
 * single beat keeps the connection alive.
 */
export const HEARTBEAT_INTERVAL_MS = 10_000;
harden(HEARTBEAT_INTERVAL_MS);

/**
 * Keep-alive window: presume the peer dead after two missed heartbeats.
 */
export const KEEPALIVE_TIMEOUT_MS = 2 * HEARTBEAT_INTERVAL_MS;
harden(KEEPALIVE_TIMEOUT_MS);

/**
 * Render an unknown thrown value (which may not be an `Error`) for a log
 * message without itself throwing.
 *
 * @param {unknown} value
 * @returns {string}
 */
const renderThrown = value => {
  if (value instanceof Error) {
    return value.message;
  }
  try {
    return String(value);
  } catch {
    return '<unrenderable thrown value>';
  }
};

/**
 * Keep an iroh QUIC connection alive with a datagram heartbeat and detect
 * a dead peer with a keep-alive watchdog. The caller owns teardown:
 * `onTimeout` fires at most once, after the watchdog has been disarmed,
 * and is expected to close the connection.
 *
 * @param {object} connection - An iroh Connection (duck-typed for testing).
 * @param {(data: number[]) => void} [connection.sendDatagram]
 * @param {() => Promise<unknown>} [connection.readDatagram]
 * @param {object} [options]
 * @param {number} [options.intervalMs] - Heartbeat send period.
 * @param {number} [options.timeoutMs] - Keep-alive window before
 *   `onTimeout`. Defaults to twice the effective `intervalMs`, so the
 *   "tolerate a single dropped beat" invariant holds for callers that
 *   only override `intervalMs`.
 * @param {() => void} [options.onTimeout] - Invoked once when the peer
 *   misses the keep-alive window.
 * @param {(message: string) => void} [options.log] - Diagnostic sink;
 *   silent by default.
 * @returns {{ stop: () => void }} A handle whose `stop()` halts the
 *   heartbeat and disarms the watchdog. Idempotent.
 */
export const makeIrohHeartbeat = (
  connection,
  {
    intervalMs = HEARTBEAT_INTERVAL_MS,
    timeoutMs = 2 * intervalMs,
    onTimeout = () => {},
    log = () => {},
  } = {},
) => {
  const { sendDatagram, readDatagram } = connection;
  const datagramsSupported =
    typeof sendDatagram === 'function' && typeof readDatagram === 'function';

  let stopped = false;
  /** @type {ReturnType<typeof setInterval> | undefined} */
  let beatTimer;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let watchdog;

  const stop = () => {
    if (stopped) {
      return;
    }
    stopped = true;
    if (beatTimer !== undefined) {
      clearInterval(beatTimer);
    }
    if (watchdog !== undefined) {
      clearTimeout(watchdog);
    }
  };

  // Arm or re-arm the keep-alive watchdog. Any inbound datagram is proof
  // of life and pushes the deadline out by a full window; the first such
  // call is also what first arms the watchdog (see the lazy-arming note
  // in the header).
  const touch = () => {
    if (stopped) {
      return;
    }
    if (watchdog !== undefined) {
      clearTimeout(watchdog);
    }
    watchdog = setTimeout(() => {
      // Disarm before notifying so the callback sees a settled heartbeat
      // and cannot re-arm by re-entry.
      stop();
      onTimeout();
    }, timeoutMs);
    if (typeof watchdog.unref === 'function') {
      watchdog.unref();
    }
  };

  const sendBeat = () => {
    if (stopped) {
      return;
    }
    try {
      // A one-byte payload suffices to generate traffic; the content is
      // ignored. The binding's `sendDatagram` takes a plain
      // `Array<number>`, and a fresh array avoids handing native code a
      // shared view. Call as a method on the connection: `sendDatagram`
      // is a NAPI-RS native method that requires `this` to be the
      // connection, so a destructured reference fails with "Illegal
      // invocation".
      /** @type {NonNullable<typeof sendDatagram>} */ (connection.sendDatagram)(
        [0],
      );
    } catch (error) {
      // A full send buffer or transient datagram error is not fatal: the
      // next beat retries and the peer's watchdog tolerates a single
      // miss. Stringify defensively: `sendDatagram` is native code and
      // may throw a non-Error value.
      log(`iroh heartbeat send failed: ${renderThrown(error)}`);
    }
  };

  // Drain inbound datagrams, re-arming the watchdog on each.
  // `readDatagram` rejects when the connection closes, which ends the
  // pump.
  const pump = () => {
    if (stopped) {
      return;
    }
    try {
      Promise.resolve(
        /** @type {NonNullable<typeof readDatagram>} */ (
          connection.readDatagram
        )(),
      ).then(
        () => {
          touch();
          pump();
        },
        () => {
          // Connection closed or datagrams ended; stop draining. The
          // stream teardown paths own closing the session.
        },
      );
    } catch {
      // `readDatagram` unavailable; leave the watchdog to the bi-stream
      // path.
    }
  };

  if (datagramsSupported) {
    beatTimer = setInterval(sendBeat, intervalMs);
    if (typeof beatTimer.unref === 'function') {
      beatTimer.unref();
    }
    // Send one beat immediately and start draining inbound datagrams.
    // The watchdog is left disarmed until the peer's first datagram arms
    // it via `pump` -> `touch`, so a non-heartbeating peer is not torn
    // down here.
    sendBeat();
    pump();
  } else {
    log('iroh heartbeat disabled: connection does not support datagrams');
  }

  return harden({ stop });
};
harden(makeIrohHeartbeat);
