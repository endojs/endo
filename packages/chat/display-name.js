// @ts-check

import harden from '@endo/harden';

/**
 * Render a user-facing display name, wrapping it in literal straight
 * double-quote scare quotes when the name is still a proposal (e.g. the
 * invitee has not yet confirmed the name the inviter suggested for them).
 *
 * Confirmed names render as-is. Proposed names render as `"name"`.
 *
 * This is kept deliberately separate from the curly-quote `\u201C \u201D`
 * decoration used elsewhere for unassigned member names in the local
 * address book: that is a viewer-local "I have not nicknamed this peer"
 * marker, while this helper is a per-owner "this name has not been
 * committed yet" marker.
 *
 * @param {string} name
 * @param {object} [options]
 * @param {boolean} [options.proposed] - Whether the name is still a
 *   proposal and should be shown in scare quotes.
 * @returns {string}
 */
export const formatDisplayName = (name, { proposed = false } = {}) => {
  if (!name) return name;
  return proposed ? `"${name}"` : name;
};
harden(formatDisplayName);

/**
 * Extract an inviter-suggested display name from an invitation locator URL.
 * Invitations may carry a `?name=<encoded>` query parameter as a hint for
 * the invitee's proposed display name; the invitee is free to accept or
 * edit it.
 *
 * Returns `undefined` when the locator cannot be parsed or carries no
 * suggestion.
 *
 * @param {string} locator - An endo:// URL.
 * @returns {string | undefined}
 */
export const extractSuggestedNameFromLocator = locator => {
  if (!locator || typeof locator !== 'string') return undefined;
  try {
    const url = new URL(locator);
    const suggested = url.searchParams.get('name');
    if (suggested && suggested.length > 0) {
      return suggested;
    }
    return undefined;
  } catch {
    return undefined;
  }
};
harden(extractSuggestedNameFromLocator);
