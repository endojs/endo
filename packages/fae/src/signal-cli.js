// @ts-check

import { execFile } from 'child_process';
import { promisify } from 'util';

/** @import { SignalInboundMessage } from './signal-types.js' */

const parseJsonLine = line => {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
};

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
 * @param {SignalCliOptions} options
 */
export const makeSignalCli = options => {
  const signalCliBin = options.signalCliBin || 'signal-cli';
  const account = options.account;
  if (!account) {
    throw new Error('signal account is required');
  }
  const execFileAsync = promisify(
    /** @type {typeof import('child_process').execFile} */ (execFile),
  );

  /**
   * @param {number} [timeoutSeconds]
   */
  const receive = async (timeoutSeconds = 1) => {
    const args = [
      '-a',
      account,
      'receive',
      '--json',
      '--timeout',
      String(timeoutSeconds),
    ];
    const { stdout } = await execFileAsync(signalCliBin, args, {
      maxBuffer: 2 * 1024 * 1024,
    });
    const lines = stdout
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
    /** @type {SignalInboundMessage[]} */
    const messages = [];
    for (const line of lines) {
      const event = parseJsonLine(line);
      if (!event) {
        // eslint-disable-next-line no-continue
        continue;
      }
      const parsed = parseSignalCliEvent(event);
      if (parsed) {
        messages.push(parsed);
      }
    }
    return harden(messages);
  };

  /**
   * @param {string} recipient
   * @param {string} text
   */
  const sendDirect = async (recipient, text) => {
    const args = ['-a', account, 'send', '-m', text, recipient];
    await execFileAsync(signalCliBin, args, {
      maxBuffer: 1024 * 1024,
    });
  };

  /**
   * @param {string} groupId
   * @param {string} text
   */
  const sendGroup = async (groupId, text) => {
    const args = ['-a', account, 'send', '-m', text, '-g', groupId];
    await execFileAsync(signalCliBin, args, {
      maxBuffer: 1024 * 1024,
    });
  };

  return harden({
    receive,
    sendDirect,
    sendGroup,
    help() {
      return (
        'Signal CLI transport wrapper. ' +
        'Methods: receive(timeoutSeconds), sendDirect(recipient, text), ' +
        'sendGroup(groupId, text).'
      );
    },
  });
};
harden(makeSignalCli);
