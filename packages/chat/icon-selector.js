// @ts-check

import harden from '@endo/harden';

import { Fragment, h } from './setup-preact-container.js';

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

/**
 * Confined Preact icon selector. A controlled mirror of
 * {@link renderIconSelector}: same `.icon-selector` markup and class names, but
 * a vnode tree driven by props instead of an HTML string. Selection state is
 * owned by the caller and surfaced through callbacks.
 *
 * @param {object} props
 * @param {string} props.selectedIcon - The currently selected emoji, or the
 *   1–2 letter value when `useLetterIcon` is set.
 * @param {boolean} props.useLetterIcon - True when the Letter tab is active.
 * @param {(icon: string) => void} props.onSelectIcon - Called with an emoji
 *   when an emoji option is clicked, or with the 1–2 letter value when the
 *   letter input changes.
 * @param {(useLetterIcon: boolean) => void} props.onToggleLetterIcon - Called
 *   with the next `useLetterIcon` value when a tab is clicked.
 * @returns {import('preact').VNode}
 */
export const IconSelector = ({
  selectedIcon,
  useLetterIcon,
  onSelectIcon,
  onToggleLetterIcon,
}) => {
  const isLetterValue = selectedIcon.length <= 2;

  const iconGrid = h(
    'div',
    { class: 'icon-grid' },
    ALL_ICONS.map(icon =>
      h(
        'button',
        {
          key: icon,
          type: 'button',
          class: `icon-option ${
            icon === selectedIcon && !useLetterIcon ? 'selected' : ''
          }`,
          'data-icon': icon,
          onClick: () => onSelectIcon(icon),
        },
        icon,
      ),
    ),
  );

  const letterInput = h(
    'div',
    { class: 'letter-icon-input' },
    h('input', {
      type: 'text',
      id: 'letter-icon',
      maxlength: '2',
      placeholder: 'AB',
      value: isLetterValue ? selectedIcon : '',
      /** @param {{ target: { value: string } }} e */
      onInput: e => onSelectIcon(letterIcon(e.target.value || 'AB')),
    }),
    h(
      'div',
      { class: 'letter-icon-preview' },
      isLetterValue ? selectedIcon : 'AB',
    ),
  );

  return h(
    Fragment,
    null,
    h('label', null, 'Icon'),
    h(
      'div',
      { class: 'icon-selector' },
      h(
        'div',
        { class: 'icon-tabs' },
        h(
          'button',
          {
            type: 'button',
            class: `icon-tab ${!useLetterIcon ? 'active' : ''}`,
            'data-tab': 'emoji',
            onClick: () => onToggleLetterIcon(false),
          },
          'Emoji',
        ),
        h(
          'button',
          {
            type: 'button',
            class: `icon-tab ${useLetterIcon ? 'active' : ''}`,
            'data-tab': 'letter',
            onClick: () => onToggleLetterIcon(true),
          },
          'Letter',
        ),
      ),
      h(
        'div',
        { class: 'icon-content' },
        useLetterIcon ? letterInput : iconGrid,
      ),
    ),
  );
};
harden(IconSelector);
