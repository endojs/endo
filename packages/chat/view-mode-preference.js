// @ts-check

import harden from '@endo/harden';

/**
 * @typedef {'chat' | 'forum' | 'outliner' | 'microblog'} ViewMode
 */

const VALID_VIEW_MODES = harden(['chat', 'forum', 'outliner', 'microblog']);

/**
 * @param {unknown} value
 * @returns {value is ViewMode}
 */
const isViewMode = value =>
  typeof value === 'string' &&
  /** @type {readonly string[]} */ (VALID_VIEW_MODES).includes(value);
harden(isViewMode);

/**
 * Build the localStorage key for a channel's view-mode preference.
 * The key is scoped per persona so the same underlying channel can have
 * a different remembered view in each persona that views it.
 *
 * @param {string} personaId
 * @param {string} channelPetName
 * @returns {string}
 */
const keyFor = (personaId, channelPetName) =>
  `channel-view-mode:${personaId}:${channelPetName}`;
harden(keyFor);

/**
 * Read the stored view mode preference for a channel under a given persona.
 * Returns undefined when no preference has been recorded (or if
 * localStorage is unavailable).
 *
 * @param {string} personaId
 * @param {string} channelPetName
 * @returns {ViewMode | undefined}
 */
export const getViewModePreference = (personaId, channelPetName) => {
  if (!personaId || !channelPetName) return undefined;
  try {
    const raw = window.localStorage.getItem(keyFor(personaId, channelPetName));
    return isViewMode(raw) ? raw : undefined;
  } catch {
    return undefined;
  }
};
harden(getViewModePreference);

/**
 * Persist the view mode preference for a channel under a given persona.
 *
 * @param {string} personaId
 * @param {string} channelPetName
 * @param {ViewMode} viewMode
 */
export const setViewModePreference = (personaId, channelPetName, viewMode) => {
  if (!personaId || !channelPetName) return;
  if (!isViewMode(viewMode)) return;
  try {
    window.localStorage.setItem(keyFor(personaId, channelPetName), viewMode);
  } catch {
    // localStorage not available
  }
};
harden(setViewModePreference);

/**
 * Resolve a channel's initial view mode, in order of precedence:
 * 1. Explicit client-side preference for (persona, channel).
 * 2. Invitation hint (suggestedViewMode) if this is the first open.
 * 3. 'chat' as the fallback default.
 *
 * @param {object} options
 * @param {string} options.personaId
 * @param {string} options.channelPetName
 * @param {ViewMode} [options.suggestedViewMode] - hint from invitation
 * @returns {ViewMode}
 */
export const resolveViewMode = ({
  personaId,
  channelPetName,
  suggestedViewMode,
}) => {
  const stored = getViewModePreference(personaId, channelPetName);
  if (stored) return stored;
  if (isViewMode(suggestedViewMode)) return suggestedViewMode;
  return 'chat';
};
harden(resolveViewMode);

/**
 * Clear all stored view mode preferences for a given persona.
 * Called when a persona's space is deleted so that re-creating a
 * space with the same persona starts fresh.
 *
 * @param {string} personaId
 */
export const clearViewModePreferences = personaId => {
  if (!personaId) return;
  try {
    const prefix = `channel-view-mode:${personaId}:`;
    const keysToRemove = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // localStorage not available
  }
};
harden(clearViewModePreferences);
