// @ts-check
/**
 * @import {
 *   ChatMessage,
 *   CustomEntry,
 *   HeaderEntry,
 *   MessageEntry,
 *   ParseResult,
 *   Role,
 *   SessionEntry,
 * } from '../types.js'
 */

/**
 * The current on-disk projection version. v1 of this projection is Pi's v3
 * shape, so the header carries `3`.
 */
export const FORMAT_VERSION = 3;

/** @type {Set<Role>} */
const STANDARD_ROLES = new Set(['system', 'user', 'assistant', 'tool']);

/**
 * @param {string} role
 * @returns {role is Role}
 */
export const isStandardRole = role =>
  STANDARD_ROLES.has(/** @type {Role} */ (role));

/**
 * Build the header entry for a new session file.
 *
 * @param {Omit<HeaderEntry, 'type' | 'version'> & { version?: number }} fields
 * @returns {HeaderEntry}
 */
export const makeHeaderEntry = ({ version = FORMAT_VERSION, ...rest }) => ({
  type: 'header',
  version,
  ...rest,
});

/**
 * Build a message entry.
 *
 * @param {ChatMessage} message
 * @param {{
 *   id: string,
 *   parentId: string | null,
 *   'endo:messageId'?: string,
 *   'endo:parentMessageId'?: string | null,
 * }} linkage
 * @returns {MessageEntry}
 */
export const makeMessageEntry = (message, linkage) => {
  /** @type {MessageEntry} */
  const entry = {
    type: 'message',
    id: linkage.id,
    parentId: linkage.parentId,
    message,
  };
  if (linkage['endo:messageId'] !== undefined) {
    entry['endo:messageId'] = linkage['endo:messageId'];
  }
  if (linkage['endo:parentMessageId'] !== undefined) {
    entry['endo:parentMessageId'] = linkage['endo:parentMessageId'];
  }
  return entry;
};

/**
 * Build a custom entry for a Pi-foreign message kind.
 *
 * @param {string} kind - The `endo:kind` discriminator.
 * @param {{
 *   id: string,
 *   parentId: string | null,
 *   payload?: Record<string, unknown>,
 * }} linkage
 * @returns {CustomEntry}
 */
export const makeCustomEntry = (kind, { id, parentId, payload = {} }) => ({
  type: 'custom',
  id,
  parentId,
  custom: { 'endo:kind': kind, ...payload },
});

/**
 * Serialize one entry as a single JSONL line (no trailing newline).
 *
 * `JSON.stringify` escapes any embedded newline inside string values, so the
 * result is guaranteed newline-free and safe to `\n`-delimit.
 *
 * @param {SessionEntry} entry
 * @returns {string}
 */
export const formatEntry = entry => JSON.stringify(entry);

/**
 * Parse one JSONL line into an entry.
 *
 * @param {string} line
 * @returns {SessionEntry}
 */
export const parseLine = line => {
  const value = JSON.parse(line);
  if (
    value === null ||
    typeof value !== 'object' ||
    typeof value.type !== 'string'
  ) {
    throw new Error('jsonl-transcript: line is not a typed entry object');
  }
  return /** @type {SessionEntry} */ (value);
};

/**
 * Parse the raw text of a session file into its entries, tolerating a torn
 * final line (a crash mid-append). Only complete newline-terminated lines are
 * parsed; anything after the last newline is returned as `trailingPartial` and
 * otherwise ignored. Blank lines are skipped.
 *
 * @param {string} text
 * @returns {ParseResult}
 */
export const parseEntries = text => {
  const lastNewline = text.lastIndexOf('\n');
  const complete = lastNewline === -1 ? '' : text.slice(0, lastNewline);
  const trailingPartial = text.slice(lastNewline + 1);
  /** @type {SessionEntry[]} */
  const entries = [];
  for (const line of complete.split('\n')) {
    if (line.length > 0) {
      entries.push(parseLine(line));
    }
  }
  return { entries, trailingPartial };
};
