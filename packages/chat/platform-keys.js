// @ts-check
/* global navigator */

/**
 * Platform-specific keyboard modifier symbols.
 *
 * On macOS, uses Unicode symbols: ⌘ (Command), ⌥ (Option), ⇧ (Shift), ⌃ (Control)
 * On Windows/Linux, uses text: Ctrl, Alt, Shift
 */

/**
 * Detect if the current platform is macOS.
 * @returns {boolean}
 */
const detectMac = () => {
  if (typeof navigator === 'undefined') {
    return false;
  }
  // Modern approach using userAgentData if available
  // @ts-ignore - userAgentData is not in all TS libs
  if (navigator.userAgentData?.platform) {
    // @ts-ignore
    return navigator.userAgentData.platform === 'macOS';
  }
  // Fallback to userAgent
  return /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
};

/** Whether the current platform is macOS */
export const isMac = detectMac();

/** Command/Ctrl modifier: ⌘ on Mac, Ctrl on Windows/Linux */
export const modKey = isMac ? '⌘' : 'Ctrl';

/** Option/Alt modifier: ⌥ on Mac, Alt on Windows/Linux */
export const optKey = isMac ? '⌥' : 'Alt';

/** Shift modifier: ⇧ on Mac, Shift on Windows/Linux */
export const shiftKey = isMac ? '⇧' : 'Shift';

/** Control modifier: ⌃ on Mac, Ctrl on Windows/Linux */
export const ctrlKey = isMac ? '⌃' : 'Ctrl';

/**
 * Format a keyboard shortcut as HTML with separate <kbd> elements.
 * On Mac, keys are adjacent (no separator).
 * On Windows/Linux, keys are separated by +.
 *
 * @param {...string} keys - The keys in the shortcut (e.g., modKey, 'Enter')
 * @returns {string} HTML string with <kbd> elements
 * @example
 * kbd(modKey, 'Enter') // Mac: '<kbd>⌘</kbd><kbd>Enter</kbd>'
 *                      // Win: '<kbd>Ctrl</kbd>+<kbd>Enter</kbd>'
 */
export const kbd = (...keys) => {
  const separator = isMac ? '</kbd><kbd>' : '</kbd>+<kbd>';
  return `<kbd>${keys.join(separator)}</kbd>`;
};

/**
 * Format a keyboard shortcut as plain text for tooltips/titles.
 * On Mac, keys are adjacent (no separator).
 * On Windows/Linux, keys are separated by +.
 *
 * @param {...string} keys - The keys in the shortcut (e.g., modKey, 'Enter')
 * @returns {string} Plain text shortcut
 * @example
 * keyCombo(modKey, 'Enter') // Mac: '⌘Enter'
 *                           // Win: 'Ctrl+Enter'
 */
export const keyCombo = (...keys) => {
  const separator = isMac ? '' : '+';
  return keys.join(separator);
};
