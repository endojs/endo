// @ts-check

/**
 * @typedef {{
 *   type: 'empty',
 * }} SignalInputEmpty
 *
 * @typedef {{
 *   type: 'message',
 *   text: string,
 * }} SignalInputMessage
 *
 * @typedef {{
 *   type: 'command',
 *   name: string,
 *   args: string,
 * }} SignalInputCommand
 *
 * @typedef {SignalInputEmpty | SignalInputMessage | SignalInputCommand} SignalInput
 */

const petNameTokenPattern = /@([a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)*)/giu;

/**
 * Parse incoming Signal text into either slash command or plain message.
 *
 * @param {string} text
 * @returns {SignalInput}
 */
export const parseSignalInput = text => {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return harden({ type: 'empty' });
  }
  if (!trimmed.startsWith('/')) {
    return harden({ type: 'message', text: trimmed });
  }

  const withoutSlash = trimmed.slice(1).trim();
  if (withoutSlash.length === 0) {
    return harden({ type: 'empty' });
  }

  const firstSpace = withoutSlash.indexOf(' ');
  const name =
    firstSpace < 0
      ? withoutSlash.toLowerCase()
      : withoutSlash.slice(0, firstSpace).toLowerCase();
  const args = firstSpace < 0 ? '' : withoutSlash.slice(firstSpace + 1).trim();
  return harden({ type: 'command', name, args });
};
harden(parseSignalInput);

/**
 * Parse a slash-command path argument like "foo/bar" into path segments.
 *
 * @param {string} arg
 * @returns {string[]}
 */
export const parsePetNamePathArg = arg =>
  arg
    .split('/')
    .map(part => part.trim())
    .filter(Boolean);
harden(parsePetNamePathArg);

/**
 * @typedef {{
 *   strings: string[],
 *   edgeNames: string[],
 *   petNames: string[],
 * }} ParsedSignalReferenceMessage
 */

/**
 * @param {string} petName
 * @returns {string}
 */
const deriveEdgeName = petName => {
  const candidate = petName.replace(/\//gu, '-').replace(/[^a-z0-9-]/giu, '-');
  const normalized = candidate.toLowerCase().replace(/-+/gu, '-');
  if (normalized.length === 0) {
    return 'value';
  }
  if (/^[0-9]/u.test(normalized)) {
    return `v-${normalized}`;
  }
  return normalized;
};

/**
 * Convert plain text with @petname references into Endo send() arrays.
 *
 * @param {string} text
 * @returns {ParsedSignalReferenceMessage}
 */
export const parseSignalReferences = text => {
  /** @type {string[]} */
  const strings = [];
  /** @type {string[]} */
  const edgeNames = [];
  /** @type {string[]} */
  const petNames = [];
  /** @type {Map<string, number>} */
  const edgeNameCounts = new Map();

  let cursor = 0;
  for (const match of text.matchAll(petNameTokenPattern)) {
    const full = match[0];
    const petName = match[1];
    const index = match.index ?? 0;
    strings.push(text.slice(cursor, index));
    cursor = index + full.length;

    const baseEdgeName = deriveEdgeName(petName);
    const seen = edgeNameCounts.get(baseEdgeName) || 0;
    edgeNameCounts.set(baseEdgeName, seen + 1);
    const edgeName = seen === 0 ? baseEdgeName : `${baseEdgeName}-${seen + 1}`;

    edgeNames.push(edgeName);
    petNames.push(petName);
  }
  strings.push(text.slice(cursor));

  if (edgeNames.length === 0) {
    return harden({
      strings: [text],
      edgeNames: [],
      petNames: [],
    });
  }

  return harden({ strings, edgeNames, petNames });
};
harden(parseSignalReferences);
