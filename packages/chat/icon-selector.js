// @ts-check

import harden from '@endo/harden';

/** Favored emoji icons grouped by category */
export const ICON_CATEGORIES = harden({
  characters: ['🧙', '🧝', '🧌', '🦸', '🥷', '🧑‍💼'],
  masks: ['👺', '👹', '🎭', '🤿'],
  fae: ['🧚'],
  djinn: ['🧞'],
  bots: ['🤖', '🦾'],
  cats: ['🐈‍⬛', '🐈'],
  etc: ['💬', '🎮', '📡'],
});
harden(ICON_CATEGORIES);

export const ALL_ICONS = harden([
  ...ICON_CATEGORIES.characters,
  ...ICON_CATEGORIES.masks,
  ...ICON_CATEGORIES.fae,
  ...ICON_CATEGORIES.djinn,
  ...ICON_CATEGORIES.bots,
  ...ICON_CATEGORIES.cats,
  ...ICON_CATEGORIES.etc,
]);
harden(ALL_ICONS);

/**
 * Generate a letter-based icon (circled letter).
 *
 * @param {string} letters - One or two letters
 * @returns {string}
 */
export const letterIcon = letters => {
  return letters.slice(0, 2).toUpperCase();
};
harden(letterIcon);

/**
 * Render the icon selector HTML.
 *
 * @param {object} state
 * @param {string} state.selectedIcon
 * @param {boolean} state.useLetterIcon
 * @returns {string} HTML string for the icon selector field
 */
export const renderIconSelector = ({ selectedIcon, useLetterIcon }) => {
  const iconGrid = ALL_ICONS.map(
    icon => `
    <button type="button" class="icon-option ${icon === selectedIcon && !useLetterIcon ? 'selected' : ''}"
            data-icon="${icon}">${icon}</button>
  `,
  ).join('');

  return `
    <div class="add-space-field">
      <label>Icon</label>
      <div class="icon-selector">
        <div class="icon-tabs">
          <button type="button" class="icon-tab ${!useLetterIcon ? 'active' : ''}" data-tab="emoji">Emoji</button>
          <button type="button" class="icon-tab ${useLetterIcon ? 'active' : ''}" data-tab="letter">Letter</button>
        </div>
        <div class="icon-content">
          ${
            useLetterIcon
              ? `
            <div class="letter-icon-input">
              <input type="text" id="letter-icon" maxlength="2" placeholder="AB" value="${selectedIcon.length <= 2 ? selectedIcon : ''}" />
              <div class="letter-icon-preview">${selectedIcon.length <= 2 ? selectedIcon : 'AB'}</div>
            </div>
          `
              : `
            <div class="icon-grid">${iconGrid}</div>
          `
          }
        </div>
      </div>
    </div>
  `;
};
harden(renderIconSelector);
