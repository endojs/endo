// @ts-check
/**
 * Mock guest powers for the Lal agent simulator.
 * Implements the GuestPowers interface the agent expects from Endo,
 * with an in-memory directory and mailbox so we can run the agent
 * without a real daemon. Used to debug LLM providers (Anthropic, etc.).
 */

import { makePromiseKit } from '@endo/promise-kit';

const SELF_ID = 'lal-self-id';

/**
 * Create mock guest powers for the Lal agent.
 * @param {object} [options]
 * @param {object} [options.initialMessage] - Optional first inbox message to deliver (default: one from HOST)
 * @returns {{ powers: object, whenDismissed: (n: number) => Promise<void>, whenSend: () => Promise<{ recipient: string, strings: string[] }>, sent: Array<{ recipient: string, strings: string[], edgeNames: string[], petNames: string[] }> }}
 */
export function makeMockPowers(options = {}) {
  const { initialMessage } = options;

  /** @type {Map<string, unknown>} directory: path key -> value */
  const directory = new Map();
  directory.set('SELF', SELF_ID);
  directory.set('HOST', 'host-id');

  /** @type {Array<{ number: number, from: string, to: string, type?: string, strings?: string[], names?: string[], ids?: string[], messageId?: string, replyTo?: string }>} */
  const messages = [];
  /** @type {Map<number, { promise: Promise<void>, resolve: () => void }>} */
  const dismissWaiters = new Map();

  /** @type {Array<{ recipient: string, strings: string[], edgeNames: string[], petNames: string[] }>} */
  const sent = [];
  const { promise: nextSendPromise, resolve: resolveNextSend } =
    makePromiseKit();

  /**
   * Returns a promise that resolves when the agent dismisses message n.
   * @param {number} n
   * @returns {Promise<void>}
   */
  function whenDismissed(n) {
    if (!dismissWaiters.has(n)) {
      const { promise, resolve } = makePromiseKit();
      dismissWaiters.set(n, { promise, resolve });
      return promise;
    }
    return dismissWaiters.get(n).promise;
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
      from: 'HOST',
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
      const key = petNamePath.join('.');
      return Promise.resolve(directory.has(key));
    },

    list(...petNamePath) {
      const prefix = petNamePath.length ? `${petNamePath.join('.')}.` : '';
      const names = new Set();
      for (const k of directory.keys()) {
        if (prefix ? k.startsWith(prefix) && k !== prefix : true) {
          const rest = prefix ? k.slice(prefix.length) : k;
          const first = rest.split('.')[0];
          if (first) names.add(first);
        }
      }
      return Promise.resolve([...names].sort());
    },

    lookup(petNameOrPath) {
      const path = Array.isArray(petNameOrPath)
        ? petNameOrPath
        : [petNameOrPath];
      const key = path.join('.');
      const v = directory.get(key);
      if (v === undefined) {
        return Promise.reject(new Error(`Unknown: ${key}`));
      }
      return Promise.resolve(v);
    },

    remove(...petNamePath) {
      const key = petNamePath.join('.');
      directory.delete(key);
      return Promise.resolve();
    },

    move(fromPath, toPath) {
      const fromKey = fromPath.join('.');
      const toKey = toPath.join('.');
      const v = directory.get(fromKey);
      if (v === undefined)
        return Promise.reject(new Error(`Unknown: ${fromKey}`));
      directory.delete(fromKey);
      directory.set(toKey, v);
      return Promise.resolve();
    },

    copy(fromPath, toPath) {
      const fromKey = fromPath.join('.');
      const toKey = toPath.join('.');
      const v = directory.get(fromKey);
      if (v === undefined)
        return Promise.reject(new Error(`Unknown: ${fromKey}`));
      directory.set(toKey, v);
      return Promise.resolve();
    },

    makeDirectory(petNamePath) {
      const key = petNamePath.join('.');
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

    adopt(messageNumber, _edgeName, petNameOrPath) {
      const path = Array.isArray(petNameOrPath)
        ? petNameOrPath
        : [petNameOrPath];
      const key = path.join('.');
      directory.set(key, `adopted-from-msg-${messageNumber}`);
      return Promise.resolve();
    },

    dismiss(messageNumber) {
      const idx = messages.findIndex(m => m.number === messageNumber);
      if (idx >= 0) messages.splice(idx, 1);
      const waiter = dismissWaiters.get(messageNumber);
      if (waiter) {
        waiter.resolve();
        dismissWaiters.delete(messageNumber);
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
          ? recipientName.join('.')
          : recipientName,
        strings,
        edgeNames,
        petNames: petNames.map(p => (Array.isArray(p) ? p.join('.') : p)),
      };
      sent.push(record);
      resolveNextSend(record);
      return Promise.resolve();
    },

    reply(messageNumber, strings, edgeNames, petNames) {
      // Find the parent message to determine the other party
      const parent = messages.find(m => m.number === messageNumber);
      const recipientName = parent
        ? parent.from === SELF_ID
          ? parent.to
          : parent.from
        : 'unknown';
      const record = {
        recipient: recipientName,
        strings,
        edgeNames,
        petNames: petNames.map(p => (Array.isArray(p) ? p.join('.') : p)),
        replyTo: parent ? parent.messageId : undefined,
      };
      sent.push(record);
      resolveNextSend(record);
      return Promise.resolve();
    },

    storeValue(value, petName) {
      const key = Array.isArray(petName) ? petName.join('.') : petName;
      directory.set(key, value);
      return Promise.resolve();
    },

    identify(...petNamePath) {
      const key = petNamePath.join('.');
      const v = directory.get(key);
      return Promise.resolve(
        v !== undefined ? /** @type {string} */ (v) : undefined,
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
  };

  return {
    powers: harden(powers),
    whenDismissed,
    whenSend,
    sent,
  };
}
