// @ts-check

import harden from '@endo/harden';

/** @import { ColorScheme } from './spaces-gutter.js' */

import { h, renderConfined } from './setup-preact-container.js';

/**
 * @typedef {object} SchemePickerAPI
 * @property {() => ColorScheme} getValue - Get the current scheme value
 * @property {(scheme: ColorScheme) => void} setValue - Set the scheme value
 * @property {(callback: (scheme: ColorScheme) => void) => void} onChange - Register a change listener
 * @property {() => void} restoreScheme - Restore the scheme that was active before the picker was created
 */

/**
 * Inline style values for each color scheme preview.
 */
const SCHEME_COLORS = harden({
  light: harden({
    bg: '#ffffff',
    text: '#212529',
    sent: '#228be6',
    sentText: '#ffffff',
    received: '#e9ecef',
    receivedText: '#212529',
  }),
  dark: harden({
    bg: '#141517',
    text: '#dee2e6',
    sent: '#1c7ed6',
    sentText: '#ffffff',
    received: '#2c2e33',
    receivedText: '#dee2e6',
  }),
  'high-contrast-light': harden({
    bg: '#ffffff',
    text: '#000000',
    sent: '#1864ab',
    sentText: '#ffffff',
    received: '#ffffff',
    receivedText: '#000000',
    receivedBorder: '2px solid #000000',
  }),
  'high-contrast-dark': harden({
    bg: '#000000',
    text: '#ffffff',
    sent: '#4dabf7',
    sentText: '#000000',
    received: '#000000',
    receivedText: '#ffffff',
    receivedBorder: '2px solid #ffffff',
  }),
});

/** @type {ColorScheme[]} */
const ALL_SCHEMES = harden([
  'auto',
  'light',
  'dark',
  'high-contrast-light',
  'high-contrast-dark',
]);

/** @type {Record<keyof typeof SCHEME_COLORS, string>} */
const SCHEME_LABELS = harden({
  light: 'Light',
  dark: 'Dark',
  'high-contrast-light': 'High Contrast Light',
  'high-contrast-dark': 'High Contrast Dark',
});

/**
 * A preview cell with miniature chat bubbles. Mirrors the original inline-styled
 * markup; the confined renderer strips no inline `style` strings here.
 *
 * @param {object} props
 * @param {keyof typeof SCHEME_COLORS} props.schemeKey
 * @returns {import('preact').VNode}
 */
const SchemePreview = ({ schemeKey }) => {
  const c = SCHEME_COLORS[schemeKey];
  const receivedBorder =
    'receivedBorder' in c ? c.receivedBorder : '1px solid transparent';
  return h(
    'div',
    {
      class: 'scheme-preview',
      style: `background:${c.bg}; border-radius:6px; padding:8px 12px; display:flex; flex-direction:column; gap:3px;`,
    },
    h(
      'div',
      {
        style: `align-self:flex-start; max-width:75%; background:${c.received}; color:${c.receivedText}; border:${receivedBorder}; border-radius:8px 8px 8px 2px; padding:2px 6px; font-size:11px;`,
      },
      '👋',
    ),
    h(
      'div',
      {
        style: `align-self:flex-end; max-width:75%; background:${c.sent}; color:${c.sentText}; border-radius:8px 8px 2px 8px; padding:2px 6px; font-size:11px;`,
      },
      '🚀',
    ),
  );
};
harden(SchemePreview);

/**
 * A captioned preview cell for one scheme.
 *
 * @param {object} props
 * @param {keyof typeof SCHEME_COLORS} props.schemeKey
 * @param {boolean} props.isSelected
 * @param {(scheme: ColorScheme) => void} props.onSelect
 * @returns {import('preact').VNode}
 */
const SchemeCell = ({ schemeKey, isSelected, onSelect }) =>
  h(
    'div',
    {
      class: `scheme-cell ${isSelected ? 'selected' : ''}`,
      'data-scheme': schemeKey,
      onClick: () => onSelect(schemeKey),
    },
    h(SchemePreview, { schemeKey }),
    h('div', { class: 'scheme-cell-caption' }, SCHEME_LABELS[schemeKey]),
  );
harden(SchemeCell);

/**
 * The confined picker body: an Auto button plus a 2x2 grid of captioned preview
 * cells. Host DOM nodes never enter this tree.
 *
 * @param {object} props
 * @param {ColorScheme} props.selected
 * @param {(scheme: ColorScheme) => void} props.onSelect
 * @returns {import('preact').VNode}
 */
const SchemePickerBody = ({ selected, onSelect }) =>
  h(
    'div',
    { class: 'scheme-picker' },
    h('label', null, 'Color Scheme'),
    h(
      'button',
      {
        type: 'button',
        class: `scheme-auto ${selected === 'auto' ? 'selected' : ''}`,
        'data-scheme': 'auto',
        onClick: () => onSelect('auto'),
      },
      'Auto (follow system)',
    ),
    h(
      'div',
      { class: 'scheme-grid' },
      h(SchemeCell, {
        schemeKey: 'light',
        isSelected: selected === 'light',
        onSelect,
      }),
      h(SchemeCell, {
        schemeKey: 'dark',
        isSelected: selected === 'dark',
        onSelect,
      }),
      h(SchemeCell, {
        schemeKey: 'high-contrast-light',
        isSelected: selected === 'high-contrast-light',
        onSelect,
      }),
      h(SchemeCell, {
        schemeKey: 'high-contrast-dark',
        isSelected: selected === 'high-contrast-dark',
        onSelect,
      }),
    ),
  );
harden(SchemePickerBody);

/**
 * Apply a color scheme to the document for live preview.
 *
 * @param {ColorScheme} scheme
 */
const applyScheme = scheme => {
  if (scheme === 'auto') {
    document.documentElement.removeAttribute('data-scheme');
  } else {
    document.documentElement.setAttribute('data-scheme', scheme);
  }
};

/**
 * Read the current color scheme from the document.
 *
 * @returns {ColorScheme}
 */
const readCurrentScheme = () => {
  const attr = document.documentElement.getAttribute('data-scheme');
  if (attr && ALL_SCHEMES.includes(/** @type {ColorScheme} */ (attr))) {
    return /** @type {ColorScheme} */ (attr);
  }
  return 'auto';
};

/**
 * Create a scheme picker component with an Auto option and a 2x2 grid of
 * captioned preview cells. Applies a live preview to the document on
 * selection change.
 *
 * The picker body is one confined Preact tree rendered through a single
 * `renderConfined` into a dedicated mount inside `$container`. `$container`
 * itself is the persistent host node (e.g. `#scheme-picker-slot`) that callers
 * re-parent into their own confined trees; that node and its mount survive
 * re-parenting, so the embedding contract is preserved.
 *
 * @param {object} options
 * @param {HTMLElement} options.$container - Container element for the picker
 * @param {ColorScheme} [options.initialValue] - Initial scheme value
 * @returns {SchemePickerAPI}
 */
export const createSchemePicker = ({ $container, initialValue = 'auto' }) => {
  // Dedicated confined mount; `$container` is the persistent host node that
  // callers re-parent. `display: contents` keeps the picker's layout applying
  // through the wrapper.
  const $mount = document.createElement('div');
  $mount.style.display = 'contents';

  /** @type {ColorScheme} */
  const originalScheme = readCurrentScheme();
  /** @type {ColorScheme} */
  let selected = ALL_SCHEMES.includes(initialValue) ? initialValue : 'auto';
  /** @type {Array<(scheme: ColorScheme) => void>} */
  const listeners = [];

  /**
   * Notify all change listeners.
   */
  const notifyChange = () => {
    for (const cb of listeners) {
      cb(selected);
    }
  };

  /**
   * Render the confined picker body for the current `selected` value.
   */
  const rerender = () => {
    renderConfined(
      h(SchemePickerBody, {
        selected,
        /** @param {ColorScheme} scheme */
        onSelect: scheme => {
          if (!ALL_SCHEMES.includes(scheme)) return;
          selected = scheme;
          applyScheme(scheme);
          rerender();
          notifyChange();
        },
      }),
      $mount,
    );
  };

  // Initial mount and render.
  $container.innerHTML = '';
  $container.appendChild($mount);
  rerender();

  return harden({
    getValue: () => selected,
    setValue: (/** @type {ColorScheme} */ scheme) => {
      if (ALL_SCHEMES.includes(scheme)) {
        selected = scheme;
        applyScheme(scheme);
        rerender();
      }
    },
    onChange: (/** @type {(scheme: ColorScheme) => void} */ callback) => {
      listeners.push(callback);
    },
    restoreScheme: () => {
      applyScheme(originalScheme);
    },
  });
};
harden(createSchemePicker);
