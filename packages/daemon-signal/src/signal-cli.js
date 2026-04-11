// @ts-check

import { spawn } from 'child_process';

/** @import { SignalInboundMessage } from './signal-types.js' */

/**
 * @param {unknown} event
 * @returns {SignalInboundMessage | undefined}
 */
export const parseSignalCliEvent = event => {
  if (!event || typeof event !== 'object') {
    return undefined;
  }
  const record = /** @type {Record<string, unknown>} */ (event);
  const envelope = /** @type {Record<string, unknown>} */ (
    (record.envelope && typeof record.envelope === 'object'
      ? record.envelope
      : record)
  );
  const dataMessage = /** @type {Record<string, unknown> | undefined} */ (
    envelope.dataMessage && typeof envelope.dataMessage === 'object'
      ? envelope.dataMessage
      : undefined
  );
  if (!dataMessage) {
    return undefined;
  }
  const textValue =
    typeof dataMessage.message === 'string'
      ? dataMessage.message
      : typeof dataMessage.body === 'string'
        ? dataMessage.body
        : undefined;
  if (typeof textValue !== 'string' || textValue.trim().length === 0) {
    return undefined;
  }
  const source =
    typeof envelope.source === 'string'
      ? envelope.source
      : typeof envelope.sourceNumber === 'string'
        ? envelope.sourceNumber
        : undefined;
  if (!source) {
    return undefined;
  }
  const groupInfo = /** @type {Record<string, unknown> | undefined} */ (
    dataMessage.groupInfo && typeof dataMessage.groupInfo === 'object'
      ? dataMessage.groupInfo
      : undefined
  );
  const groupId =
    (groupInfo && typeof groupInfo.groupId === 'string' && groupInfo.groupId) ||
    (typeof dataMessage.groupId === 'string' ? dataMessage.groupId : undefined);
  const groupName =
    (groupInfo &&
      typeof groupInfo.groupName === 'string' &&
      groupInfo.groupName) ||
    undefined;

  return harden({
    source,
    sourceUuid:
      typeof envelope.sourceUuid === 'string' ? envelope.sourceUuid : undefined,
    groupId,
    groupName,
    text: textValue,
  });
};
harden(parseSignalCliEvent);

/**
 * @typedef {{
 *   account: string,
 *   signalCliBin?: string,
 * }} SignalCliOptions
 */

/**
 * Persistent signal-cli jsonRpc transport.
 * Runs one signal-cli process for the lifetime of the transport; receives
 * arrive as JSON-RPC notifications, sends are JSON-RPC method calls.
 *
 * @param {SignalCliOptions} options
 */
export const makeSignalCli = options => {
  const signalCliBin = options.signalCliBin || 'signal-cli';
  const account = options.account;
  if (!account) {
    throw new Error('signal account is required');
  }

  /** @type {import('child_process').ChildProcess | null} */
  let proc = null;
  let lineBuffer = '';
  let nextId = 1;
  /** @type {Map<number, { resolve: (v: unknown) => void, reject: (e: Error) => void }>} */
  const pending = new Map();
  /** @type {SignalInboundMessage[]} */
  const messageQueue = [];
  /** @type {Array<(msg: SignalInboundMessage | null) => void>} */
  const waiters = [];

  const handleLine = (/** @type {string} */ line) => {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg && typeof msg === 'object' && msg.id !== undefined) {
      const entry = pending.get(msg.id);
      if (entry) {
        pending.delete(msg.id);
        if (msg.error) {
          entry.reject(
            new Error(
              (msg.error && msg.error.message) || 'JSON-RPC error',
            ),
          );
        } else {
          entry.resolve(msg.result);
        }
      }
    } else if (msg && msg.method === 'receive') {
      const parsed = parseSignalCliEvent(msg.params);
      if (parsed) {
        if (waiters.length > 0) {
          const waiter = waiters.shift();
          if (waiter) waiter(parsed);
        } else {
          messageQueue.push(parsed);
        }
      }
    }
  };

  const ensureStarted = () => {
    if (proc) return;
    proc = spawn(
      signalCliBin,
      [
        '-a',
        account,
        '-o',
        'json',
        'jsonRpc',
        '--receive-mode',
        'on-start',
        '--ignore-stories',
        '--ignore-avatars',
      ],
      { stdio: ['pipe', 'pipe', 'inherit'] },
    );
    lineBuffer = '';

    if (proc.stdout) {
      proc.stdout.setEncoding('utf8');
      proc.stdout.on('data', (/** @type {string} */ chunk) => {
        lineBuffer += chunk;
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() || '';
        for (const line of lines) {
          handleLine(line);
        }
      });
    }

    proc.on('exit', () => {
      proc = null;
      for (const entry of pending.values()) {
        entry.reject(new Error('signal-cli process exited'));
      }
      pending.clear();
      for (const waiter of waiters.splice(0)) {
        waiter(null);
      }
    });
  };

  /**
   * @param {string} method
   * @param {object} params
   * @returns {Promise<unknown>}
   */
  const call = (method, params) => {
    ensureStarted();
    const id = nextId;
    nextId += 1;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      const req = `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`;
      if (proc && proc.stdin) {
        proc.stdin.write(req);
      } else {
        pending.delete(id);
        reject(new Error('signal-cli stdin not available'));
      }
    });
  };

  /**
   * Wait for up to timeoutSeconds for incoming messages.
   * Returns immediately if messages are already queued.
   *
   * @param {number} [timeoutSeconds]
   * @returns {Promise<readonly SignalInboundMessage[]>}
   */
  const receive = async (timeoutSeconds = 10) => {
    ensureStarted();
    /** @type {SignalInboundMessage[]} */
    const messages = [];

    // Drain any already-queued messages first.
    while (messageQueue.length > 0) {
      messages.push(/** @type {SignalInboundMessage} */ (messageQueue.shift()));
    }
    if (messages.length > 0) {
      return harden(messages);
    }

    // Wait for a message or timeout.
    const msg = await new Promise(resolve => {
      /** @param {SignalInboundMessage | null} m */
      const waiterFn = m => {
        clearTimeout(timer);
        resolve(m);
      };
      const timer = setTimeout(() => {
        const idx = waiters.indexOf(waiterFn);
        if (idx >= 0) waiters.splice(idx, 1);
        resolve(null);
      }, timeoutSeconds * 1000);
      waiters.push(waiterFn);
    });

    if (msg !== null) {
      messages.push(msg);
      // Drain any more that arrived while we were processing.
      while (messageQueue.length > 0) {
        messages.push(
          /** @type {SignalInboundMessage} */ (messageQueue.shift()),
        );
      }
    }

    return harden(messages);
  };

  /**
   * @param {string} recipient
   * @param {string} text
   */
  const sendDirect = async (recipient, text) => {
    await call('send', { recipient: [recipient], message: text });
  };

  /**
   * @param {string} groupId
   * @param {string} text
   */
  const sendGroup = async (groupId, text) => {
    await call('send', { groupId, message: text });
  };

  // Start the jsonRpc process eagerly so the first receive is fast.
  ensureStarted();

  return harden({
    receive,
    sendDirect,
    sendGroup,
    help() {
      return (
        'Signal CLI jsonRpc transport (persistent process). ' +
        'Methods: receive(timeoutSeconds), sendDirect(recipient, text), ' +
        'sendGroup(groupId, text).'
      );
    },
  });
};
harden(makeSignalCli);
