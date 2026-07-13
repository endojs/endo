// @ts-check

/**
 * Shared confinement primitives for the filesystem read surface: the
 * realpath-classifying wrapper every file powers provider builds its
 * `maybeRealPath` from, and the containment predicate that decides whether a
 * resolved physical path sits inside a confinement root. Both the search engine
 * (`./search.js`) and — as the daemon-integration layer of the #127 stack lands
 * — the daemon mount (`@endo/daemon` `mount.js`, whose `assertConfined` today
 * hand-rolls the identical realpath try/catch and `startsWith` check) draw from
 * this one home so the confinement rule cannot drift between the JS engine and
 * the mount that reveals it.
 */

import harden from '@endo/harden';

/**
 * The Node filesystem error codes that mean a path has no resolvable real
 * referent — it does not exist (`ENOENT`), a path component is not a directory
 * so it cannot exist as named (`ENOTDIR`), or it dead-ends in a symlink loop
 * (`ELOOP`). These are the only conditions `maybeRealPath` swallows to
 * `undefined`.
 */
const unresolvableCodes = new Set(['ENOENT', 'ENOTDIR', 'ELOOP']);

/**
 * Wrap a throwing `realPath` into the `maybeRealPath` shape a confined walk
 * wants: resolve to the symlink-free physical path, or `undefined` *only* when
 * the referent does not exist. Any other rejection — a permission error, or a
 * programmer error such as a `RangeError` — passes through, so a genuine bug is
 * never silently masked as "unresolvable".
 *
 * This is the single place realPath's errors are classified, shared by every
 * file powers provider (the Node powers, `provideSearch`'s adapter, and, later,
 * the daemon mount) so the classification cannot drift between them.
 *
 * @param {(path: string) => Promise<string>} realPath
 * @returns {(path: string) => Promise<string | undefined>}
 */
export const makeMaybeRealPath = realPath => async path => {
  await null;
  try {
    return await realPath(path);
  } catch (error) {
    const code = /** @type {{ code?: unknown }} */ (error)?.code;
    if (typeof code === 'string' && unresolvableCodes.has(code)) {
      return undefined;
    }
    throw error;
  }
};
harden(makeMaybeRealPath);

/**
 * Whether a resolved physical `realPath` (or `undefined`) is contained within a
 * resolved confinement `root`. An unresolvable path is never contained; a
 * missing (`undefined`) root contains nothing. Containment is lexical over
 * already-realpath'd paths: identical to the root, or under `${root}/`.
 *
 * @param {string | undefined} realPath
 * @param {string | undefined} root
 * @returns {boolean}
 */
export const isPathWithin = (realPath, root) => {
  if (realPath === undefined || root === undefined) {
    return false;
  }
  return realPath === root || realPath.startsWith(`${root}/`);
};
harden(isPathWithin);
