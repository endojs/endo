// @ts-check

/**
 * Pet-name and path type guards for `@endo/daemon`.
 *
 * These `@endo/patterns` matchers describe daemon-canonical pet names
 * (lowercase strings: `a-z` start, then `a-z0-9-`) and pet-name paths
 * (arrays of one or more names).  They are exported so packages that
 * accept the daemon's pet-name surface (notably `@endo/lal`) can validate
 * inbound arguments against the same shapes the daemon's own interfaces
 * use, without redefining them.
 *
 * Pattern matching is intentionally runtime-only: at this layer we
 * confirm the type and arity, and leave per-character pet-name
 * validation to the implementation (`packages/daemon/src/pet-name.js`).
 */

import { M } from '@endo/patterns';

/** A single pet name or special name. */
export const NameShape = M.string();
harden(NameShape);

/** A path of one or more pet name segments. */
export const NamePathShape = M.arrayOf(NameShape);
harden(NamePathShape);

/** Either a single name or a path. */
export const NameOrPathShape = M.or(NameShape, NamePathShape);
harden(NameOrPathShape);

/** An array of names or paths, used for batch operations. */
export const NamesOrPathsShape = M.arrayOf(NameOrPathShape);
harden(NamesOrPathsShape);
