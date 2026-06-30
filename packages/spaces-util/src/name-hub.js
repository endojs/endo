// @ts-check

/** @import { ERef } from '@endo/far' */

import harden from '@endo/harden';

import { E } from '@endo/far';

/**
 * The slice of a daemon naming hub (`NameHub` / `EndoDirectory` / `EndoHost`)
 * that resolves a pet-name path to its value.
 *
 * The daemon types `lookup`'s single parameter as `string | string[]`, and
 * that union is a footgun: because the one argument accepts *both* a bare name
 * and a whole path array, `E(hub).lookup(...path)` (spread — passes only the
 * first segment) and `E(hub).lookup(path)` (the array) BOTH type-check while
 * behaving differently. The spread form silently drops every segment after the
 * first. Sibling methods on the same hub — `identify(...path)`, `has(...path)`,
 * `list(...path)` — genuinely ARE variadic, so the spread habit is trivially
 * copied onto `lookup` by mistake (this exact bug shipped once already).
 *
 * @typedef {object} LookupHub
 * @property {(petNamePath: string | string[]) => Promise<unknown>} lookup
 */

/**
 * Resolve a multi-segment pet-name PATH on a naming hub, always passing the
 * whole array as `lookup`'s single argument.
 *
 * Prefer this over `E(hub).lookup(path)` for any path that is an array: the
 * strict `string[]` parameter (no `string` union, not variadic) makes the
 * `lookup(...path)` spread mistake a compile error at the call site, which the
 * permissive daemon signature cannot. For a single known name, plain
 * `E(hub).lookup(name)` is already unambiguous and needs no helper.
 *
 * @param {ERef<LookupHub>} hub - The naming hub to resolve against.
 * @param {string[]} petNamePath - The pet-name path, one segment per element.
 * @returns {Promise<unknown>} The value at that path.
 */
export const lookupPath = (hub, petNamePath) => E(hub).lookup(petNamePath);
harden(lookupPath);
