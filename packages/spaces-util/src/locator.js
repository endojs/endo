// @ts-check

import { parseLocator } from '@endo/daemon/locator.js';

export { assertValidLocator } from '@endo/daemon/locator.js';

/**
 * Derive a bare formula identifier (`number:node`) from an `endo://` locator.
 * The daemon's identifier-side helpers are intentionally daemon-internal, so
 * this rebuilds the id from the public `parseLocator` output for UI callers
 * that need a formula id (e.g. `reverseIdentify` for pet-name display).
 *
 * @param {string} locator - An `endo://` locator.
 * @returns {string} The bare formula identifier.
 */
export const idFromLocator = locator => {
  const { number, node } = parseLocator(locator);
  return `${number}:${node}`;
};
