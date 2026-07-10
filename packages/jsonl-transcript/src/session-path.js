// @ts-check
// Path helpers for the on-disk session layout:
//
//   <statePath>/sessions/<guestId>/<timestamp>_<sessionId>.jsonl
//
// `<statePath>` is the daemon's state directory (`ENDO_STATE_PATH`, the
// `$ENDO_STATE` of the design). One directory per guest, one file per session.
// Paths are composed with `/` — the layout is POSIX, matching the daemon's
// state tree.

const SESSIONS = 'sessions';

/**
 * A conservative slug: keep the characters that are safe in a path segment and
 * replace the rest with `-`. Guest ids and session ids are 256-bit hex or
 * UUIDs in practice, so this is a guard against a malformed id escaping the
 * sessions tree, not a general sanitizer.
 *
 * A segment that is empty or made up only of dots is a case the character
 * filter alone does not catch: `.` and `..` survive it unchanged (both
 * characters are in the keep-set) yet name the current or parent directory
 * rather than a child, so `sessions/..` would escape to the state root and an
 * empty segment would collapse the guest namespace. Such a segment is prefixed
 * with `_`, yielding a literal, non-traversing name.
 *
 * @param {string} segment
 * @returns {string}
 */
export const slugSegment = segment => {
  const slug = String(segment).replace(/[^A-Za-z0-9._-]/g, '-');
  if (slug === '' || /^\.+$/.test(slug)) {
    return `_${slug}`;
  }
  return slug;
};

/**
 * The directory that holds one guest's session files.
 *
 * @param {string} statePath
 * @param {string} guestId
 * @returns {string}
 */
export const sessionDirPath = (statePath, guestId) =>
  `${statePath}/${SESSIONS}/${slugSegment(guestId)}`;

/**
 * The file name for a single session, `<timestamp>_<sessionId>.jsonl`. The
 * timestamp is a zero-padded epoch-millis value so the lexical order of file
 * names matches chronological order.
 *
 * @param {{ timestamp: number, sessionId: string }} session
 * @returns {string}
 */
export const sessionFileName = ({ timestamp, sessionId }) => {
  const stamp = String(timestamp).padStart(14, '0');
  return `${stamp}_${slugSegment(sessionId)}.jsonl`;
};

/**
 * The full path to a session file.
 *
 * @param {string} statePath
 * @param {string} guestId
 * @param {{ timestamp: number, sessionId: string }} session
 * @returns {string}
 */
export const sessionFilePath = (statePath, guestId, session) =>
  `${sessionDirPath(statePath, guestId)}/${sessionFileName(session)}`;
