// @ts-check

import harden from '@endo/harden';

// Control characters \x00-\x1f are rejected wholesale. NUL is the
// classic C-string truncation vector; \x01-\x1f include other
// characters that misbehave on common host filesystems and are easy
// to smuggle into shell command lines or log output downstream.
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR = /[\x00-\x1f]/;

/**
 * Validate a single zip-entry path segment against directory-traversal
 * and ambiguity attacks. Rejects empty, `.`, `..`, and any segment
 * containing a control character (`\x00`-`\x1f`).
 *
 * Used by both the read side (validating entries from a zip's central
 * directory) and the write side (validating segments of a tree about
 * to be serialized into a new archive). Lives in `@endo/zip` so the
 * adapters that compose with `ZipReader` / `ZipWriter` share a single
 * definition.
 *
 * @param {string} segment
 * @param {string} fullPath
 * @param {string} archiveName
 */
export const assertSafePathSegment = (segment, fullPath, archiveName) => {
  if (segment === '') {
    throw new Error(
      `Zip ${archiveName} entry ${JSON.stringify(
        fullPath,
      )} has an empty path segment`,
    );
  }
  if (segment === '.' || segment === '..') {
    throw new Error(
      `Zip ${archiveName} entry ${JSON.stringify(
        fullPath,
      )} contains a forbidden path segment ${JSON.stringify(segment)}`,
    );
  }
  if (CONTROL_CHAR.test(segment)) {
    throw new Error(
      `Zip ${archiveName} entry ${JSON.stringify(
        fullPath,
      )} contains a control character in a path segment`,
    );
  }
};
harden(assertSafePathSegment);

/**
 * Validate a path supplied to a runtime API (e.g. `has`, `list`,
 * `lookup` on a readable-tree exo). Applies the same per-segment
 * validator used at construction time so adversarial input arriving
 * over CapTP cannot bypass the construction-time checks.
 *
 * @param {readonly string[]} segments
 * @param {string} archiveName
 */
export const assertSafePathSegments = (segments, archiveName) => {
  for (const segment of segments) {
    assertSafePathSegment(segment, segments.join('/'), archiveName);
  }
};
harden(assertSafePathSegments);

/**
 * Split a slash-joined zip entry path into segments and validate each
 * one. Returns the validated segments.
 *
 * @param {string} fullPath
 * @param {string} archiveName
 * @returns {string[]}
 */
export const splitAndValidatePath = (fullPath, archiveName) => {
  const segments = fullPath.split('/');
  for (const segment of segments) {
    assertSafePathSegment(segment, fullPath, archiveName);
  }
  return segments;
};
harden(splitAndValidatePath);
