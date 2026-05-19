// @ts-check
/**
 * Mock guest powers for the Lal/Fae agent loops.
 * Implements the GuestPowers interface the agent expects from Endo,
 * with an in-memory directory and mailbox so we can run the agent
 * without a real daemon. Used by the simulator runner, by deterministic
 * provider-fixture tests, and reused from Fae's test suite.
 */

import { makePromiseKit } from '@endo/promise-kit';

const SELF_ID = 'lal-self-id';

/**
 * @param {number | bigint | string} value
 * @returns {bigint}
 */
const normalizeMessageNumber = value => {
  if (typeof value === 'string' && value.startsWith('+')) {
    return BigInt(value.slice(1));
  }
  return BigInt(value);
};

/**
 * @param {number | bigint | string} left
 * @param {number | bigint | string} right
 */
const sameMessageNumber = (left, right) =>
  normalizeMessageNumber(left) === normalizeMessageNumber(right);

/** @param {number | bigint | string} value */
const messageNumberKey = value => String(normalizeMessageNumber(value));

/**
 * Create mock guest powers for the Lal or Fae agent.
 *
 * Pass `attachments` to make `lookupById` resolve to real refs and let
 * `adopt(messageNumber, edgeName, ...)` install the actual capability
 * (e.g. a FaeTool) into the directory by walking the message's
 * names/ids arrays. Without attachments, `adopt` falls back to a
 * placeholder string (suitable for tests that only care that adoption
 * happened, not what was adopted).
 *
 * @param {object} [options]
 * @param {object} [options.initialMessage] - Optional first inbox message to deliver (default: one from HOST)
 * @param {Map<string, unknown>} [options.attachments] - id -> ref map for lookupById and adopt
 * @returns {{ powers: object, whenDismissed: (n: number) => Promise<void>, whenSend: () => Promise<{ recipient: string, strings: string[] }>, sent: Array<{ recipient: string, strings: string[], edgeNames: string[], petNames: string[], replyTo?: string }>, adoptions: Array<{ messageNumber: string, edgeName: string, petName: string }> }}
 */
export function makeMockPowers(options = {}) {
  const { initialMessage, attachments } = options;

  /** @type {Map<string, unknown>} directory: path key -> value */
  const directory = new Map();
  directory.set('@self', SELF_ID);
  directory.set('@host', 'host-id');

  /** @type {Array<{ number: number, from: string, to: string, type?: string, strings?: string[], names?: string[], ids?: string[], messageId?: string, replyTo?: string }>} */
  const messages = [];
  /** @type {Map<string, { promise: Promise<unknown>, resolve: (value?: unknown) => void }>} */
  const dismissWaiters = new Map();

  /** @type {Array<{ recipient: string, strings: string[], edgeNames: string[], petNames: string[], replyTo?: string }>} */
  const sent = [];
  /** @type {Array<{ messageNumber: string, edgeName: string, petName: string }>} */
  const adoptions = [];
  const { promise: nextSendPromise, resolve: resolveNextSend } =
    makePromiseKit();

  /**
   * Returns a promise that resolves when the agent dismisses message n.
   * @param {number} n
   * @returns {Promise<void>}
   */
  function whenDismissed(n) {
    const key = messageNumberKey(n);
    if (!dismissWaiters.has(key)) {
      const { promise, resolve } = makePromiseKit();
      dismissWaiters.set(key, { promise, resolve });
      return /** @type {Promise<void>} */ (promise);
    }
    return /** @type {Promise<void>} */ (
      /** @type {{ promise: Promise<unknown>, resolve: (value?: unknown) => void }} */ (
        dismissWaiters.get(key)
      ).promise
    );
  }

  function whenSend() {
    return nextSendPromise;
  }

  let nextMessageId = 1;
  /**
   * Generate a mock messageId.
   * @returns {string}
   */
  function makeMessageId() {
    const id = `mock-msg-${nextMessageId}`;
    nextMessageId += 1;
    return id;
  }

  /** Inbox message to deliver first (then followMessages ends). */
  const firstMessage =
    initialMessage ||
    harden({
      number: 1,
      from: '@host',
      to: SELF_ID,
      messageId: makeMessageId(),
      strings: [
        'Hello from the simulator. Please reply with a short greeting and then dismiss this message (dismiss message 1).',
      ],
      names: [],
      ids: [],
    });

  messages.push(firstMessage);

  async function* followMessages() {
    for (const m of messages) {
      yield m;
    }
  }

  const powers = {
    help(methodName) {
      return Promise.resolve(
        methodName
          ? `Mock help for ${methodName}`
          : 'Mock guest powers for Lal simulator.',
      );
    },

    has(...petNamePath) {
      const key = petNamePath.join('/');
      return Promise.resolve(directory.has(key));
    },

    list(...petNamePath) {
      const prefix = petNamePath.length ? `${petNamePath.join('/')}/` : '';
      const names = new Set();
      for (const k of directory.keys()) {
        if (prefix ? k.startsWith(prefix) && k !== prefix : true) {
          const rest = prefix ? k.slice(prefix.length) : k;
          const first = rest.split('/')[0];
          if (first) names.add(first);
        }
      }
      return Promise.resolve([...names].sort());
    },

    lookup(petNameOrPath) {
      const path = Array.isArray(petNameOrPath)
        ? petNameOrPath
        : [petNameOrPath];
      const key = path.join('/');
      const v = directory.get(key);
      if (v === undefined) {
        return Promise.reject(new Error(`Unknown: ${key}`));
      }
      return Promise.resolve(v);
    },

    remove(...petNamePath) {
      const key = petNamePath.join('/');
      directory.delete(key);
      return Promise.resolve();
    },

    move(fromPath, toPath) {
      const fromKey = fromPath.join('/');
      const toKey = toPath.join('/');
      const v = directory.get(fromKey);
      if (v === undefined)
        return Promise.reject(new Error(`Unknown: ${fromKey}`));
      directory.delete(fromKey);
      directory.set(toKey, v);
      return Promise.resolve();
    },

    copy(fromPath, toPath) {
      const fromKey = fromPath.join('/');
      const toKey = toPath.join('/');
      const v = directory.get(fromKey);
      if (v === undefined)
        return Promise.reject(new Error(`Unknown: ${fromKey}`));
      directory.set(toKey, v);
      return Promise.resolve();
    },

    makeDirectory(petNamePath) {
      const key = petNamePath.join('/');
      directory.set(key, { __mockDirectory: true, path: key });
      return Promise.resolve({ __mockDirectory: true, path: key });
    },

    listMessages() {
      return Promise.resolve(
        messages.map(m => ({
          number: m.number,
          from: m.from,
          to: m.to,
          strings: m.strings || [],
          names: m.names || [],
          ids: m.ids || [],
          messageId: m.messageId,
          replyTo: m.replyTo,
        })),
      );
    },

    resolve(messageNumber, _petNameOrPath) {
      return Promise.resolve();
    },

    reject(messageNumber, _reason) {
      return Promise.resolve();
    },

    adopt(messageNumber, edgeName, petNameOrPath) {
      const path = Array.isArray(petNameOrPath)
        ? petNameOrPath
        : [petNameOrPath];
      const key = path.join('/');
      // If we have a real ref for this edge, install it; otherwise
      // fall back to a placeholder so tests that don't care about the
      // adopted value still see "something" at the key.
      /** @type {unknown} */
      let value = `adopted-from-msg-${messageNumber}`;
      if (attachments) {
        const parent = messages.find(m =>
          sameMessageNumber(m.number, messageNumber),
        );
        if (
          parent &&
          Array.isArray(parent.names) &&
          Array.isArray(parent.ids)
        ) {
          const edgeIndex = parent.names.indexOf(edgeName);
          if (edgeIndex >= 0) {
            const id = parent.ids[edgeIndex];
            if (attachments.has(id)) {
              value = attachments.get(id);
            }
          }
        }
      }
      directory.set(key, value);
      adoptions.push({
        messageNumber: messageNumberKey(messageNumber),
        edgeName,
        petName: key,
      });
      return Promise.resolve();
    },

    lookupById(id) {
      if (!attachments || !attachments.has(id)) {
        return Promise.reject(new Error(`Unknown id: ${id}`));
      }
      return Promise.resolve(attachments.get(id));
    },

    dismiss(messageNumber) {
      const idx = messages.findIndex(m =>
        sameMessageNumber(m.number, messageNumber),
      );
      if (idx >= 0) messages.splice(idx, 1);
      const key = messageNumberKey(messageNumber);
      const waiter = dismissWaiters.get(key);
      if (waiter) {
        waiter.resolve();
        dismissWaiters.delete(key);
      }
      return Promise.resolve();
    },

    request(recipientName, description, _responseName) {
      return Promise.resolve({
        __mockRequest: true,
        recipientName,
        description,
      });
    },

    send(recipientName, strings, edgeNames, petNames) {
      const record = {
        recipient: Array.isArray(recipientName)
          ? recipientName.join('/')
          : recipientName,
        strings,
        edgeNames,
        petNames: petNames.map(p => (Array.isArray(p) ? p.join('/') : p)),
      };
      sent.push(record);
      resolveNextSend(record);
      return Promise.resolve();
    },

    reply(messageNumber, strings, edgeNames, petNames) {
      // Find the parent message to determine the other party
      const parent = messages.find(m =>
        sameMessageNumber(m.number, messageNumber),
      );
      const recipientName = parent
        ? parent.from === SELF_ID
          ? parent.to
          : parent.from
        : 'unknown';
      const record = {
        recipient: recipientName,
        strings,
        edgeNames,
        petNames: petNames.map(p => (Array.isArray(p) ? p.join('/') : p)),
        replyTo: parent ? parent.messageId : undefined,
      };
      sent.push(record);
      resolveNextSend(record);
      return Promise.resolve();
    },

    storeValue(value, petName) {
      const key = Array.isArray(petName) ? petName.join('/') : petName;
      directory.set(key, value);
      return Promise.resolve();
    },

    identify(...petNamePath) {
      const key = petNamePath.join('/');
      const v = directory.get(key);
      return Promise.resolve(
        v !== undefined ? /** @type {string} */ (v) : undefined,
      );
    },

    locate(...petNamePath) {
      const key = petNamePath.join('/');
      const v = directory.get(key);
      return Promise.resolve(
        v !== undefined
          ? `endo://localhost/?id=${/** @type {string} */ (v)}&type=handle`
          : undefined,
      );
    },

    followMessages() {
      return followMessages();
    },

    evaluate(_workerName, source, _codeNames, _edgeNames, _resultName) {
      return Promise.resolve({
        __mockEval: true,
        message: `Mock would run: ${source.slice(0, 50)}...`,
      });
    },

    form(_recipientName, _label, _fields) {
      return Promise.resolve();
    },
  };

  return {
    powers: harden(powers),
    whenDismissed,
    whenSend,
    sent,
    adoptions,
  };
}
