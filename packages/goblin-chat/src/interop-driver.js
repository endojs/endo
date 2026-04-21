// @ts-check
/* global setTimeout, clearTimeout */

/**
 * Shared driver for one side of a goblin-chat interop exchange.
 *
 * The chatroom protocol is symmetric: every participant joins the same
 * room, subscribes an observer, sends one local message, and waits to
 * see both the remote participant's message and the echo of its own.
 * The same routine therefore drives:
 *
 *   - the Endo OCapN client side of the Endo↔Guile CI test (against
 *     a Guile-hosted chatroom; see `packages/ocapn/test/goblin-chat/`),
 *   - both sides of the all-JS self-interop test in
 *     `packages/goblin-chat/test/interop-self.test.js` (where one
 *     participant holds the local `^chatroom` Far and the other talks
 *     to it through the OCapN websocket netlayer).
 *
 * Sending is gated on observing a `user-joined` event for a *different*
 * participant. This matches the trigger the Guile interop client uses
 * (`(not (eq? joining-user user))`) and avoids a race where one side
 * sends before the other has finished subscribing — the chatroom would
 * broadcast the message only to subscribers present at send time, so
 * an early send would silently drop on the floor.
 */

import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';

import { makeUserControllerPair } from './backend.js';

const DEFAULT_TIMEOUT_MS = 30000;

/**
 * @typedef {(line: string) => void} InteropLog
 */

/**
 * @typedef {object} ChatParticipantOptions
 * @property {any} chatroom
 *   The chatroom to join. May be a local `^chatroom` Far (from
 *   `makeChatroom`) or a remote presence enlivened from an OCapN
 *   sturdyref.
 * @property {string} name
 *   `self-proposed-name` for this participant's user-controller pair.
 * @property {string} localMessage
 *   What this participant sends once it observes another joiner.
 * @property {string} expectedRemoteMessage
 *   What this participant expects the other side to send. Resolution
 *   is gated on observing this string in `new-message`.
 * @property {number} [timeoutMs]
 *   Hard deadline for the whole exchange. Defaults to 30s.
 * @property {InteropLog} [log]
 *   Optional progress sink for human-readable status lines.
 */

/**
 * Drive one side of a goblin-chat interop exchange.
 *
 * Resolves once **all** of the following have happened:
 *   1. our `send-message` has been ack'd by the chatroom,
 *   2. an inbound `new-message` carrying `expectedRemoteMessage` was
 *      observed on our subscription, and
 *   3. an inbound `new-message` carrying `localMessage` was observed
 *      (the chatroom echoes our own send back to all subscribers,
 *      including ourselves — observing it confirms full round-trip).
 *
 * Rejects if the deadline elapses, if `subscribe` returns a non-`OK`
 * status, or if `send-message` rejects.
 *
 * @param {ChatParticipantOptions} options
 * @returns {Promise<void>}
 */
export const runChatParticipant = async ({
  chatroom,
  name,
  localMessage,
  expectedRemoteMessage,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  log = () => undefined,
}) => {
  const { user, userController } = makeUserControllerPair(name);
  const channel = await E(userController)['join-room'](chatroom);

  /** @type {Set<string>} */
  const seenMessages = new Set();
  let sentLocalMessageAck = false;
  let sendInFlight = false;

  /** @type {(value?: unknown) => void} */
  let resolveDone;
  /** @type {(reason?: any) => void} */
  let rejectDone;
  const done = new Promise((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });
  const timeout = setTimeout(() => {
    rejectDone(
      Error(
        `[${name}] timed out waiting for interop messages (${timeoutMs}ms); ` +
          `seen=${[...seenMessages].join('|')} sentAck=${sentLocalMessageAck}`,
      ),
    );
  }, timeoutMs);

  const finishIfReady = () => {
    if (
      sentLocalMessageAck &&
      seenMessages.has(expectedRemoteMessage) &&
      seenMessages.has(localMessage)
    ) {
      log(`[${name}] interop observer received both expected messages`);
      resolveDone(undefined);
    }
  };

  const sendOnce = () => {
    if (sendInFlight || sentLocalMessageAck) return;
    sendInFlight = true;
    E(channel)
      ['send-message'](localMessage)
      .then(ack => {
        sentLocalMessageAck = true;
        log(`[${name}] sent message, ack = ${JSON.stringify(ack)}`);
        finishIfReady();
      })
      .catch(err => {
        rejectDone(err);
      });
  };

  const observer = Far('interop-observer', {
    'new-message': (_context, _fromUser, message) => {
      if (typeof message !== 'string') return;
      log(`[${name}] interop observer received message: ${message}`);
      seenMessages.add(message);
      finishIfReady();
    },
    'user-joined': joiningUser => {
      // Skip the chatroom backfill self-echo (see `Bit-for-bit with
      // Guile` notes in src/backend.js): the joiner's own user appears
      // last in the backfill. We send only when we observe a different
      // participant, mirroring the Guile interop client's trigger.
      if (joiningUser === user) return;
      sendOnce();
    },
    'user-left': _user => undefined,
  });

  const [status] = await E(channel).subscribe(observer);
  if (status !== 'OK') {
    clearTimeout(timeout);
    throw Error(`[${name}] unexpected subscribe status: ${status}`);
  }
  log(`[${name}] subscription ready`);

  try {
    await done;
  } finally {
    clearTimeout(timeout);
  }
};
