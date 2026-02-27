// @ts-check
/* global document */

/** @import { ColorScheme } from './spaces-gutter.js' */

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

/**
 * Render a preview cell with miniature chat bubbles.
 *
 * @param {keyof typeof SCHEME_COLORS} schemeKey
 * @returns {string}
 */
const renderPreview = schemeKey => {
  const c = SCHEME_COLORS[schemeKey];
  const receivedBorder =
    'receivedBorder' in c ? c.receivedBorder : '1px solid transparent';
  return `<div class="scheme-preview" style="background:${c.bg}; border-radius:6px; padding:8px 12px; display:flex; flex-direction:column; gap:3px;">
    <div style="align-self:flex-start; max-width:75%; background:${c.received}; color:${c.receivedText}; border:${receivedBorder}; border-radius:8px 8px 8px 2px; padding:2px 6px; font-size:11px;">👋</div>
    <div style="align-self:flex-end; max-width:75%; background:${c.sent}; color:${c.sentText}; border-radius:8px 8px 2px 8px; padding:2px 6px; font-size:11px;">🚀</div>
  </div>`;
};

/** @type {Record<keyof typeof SCHEME_COLORS, string>} */
const SCHEME_LABELS = harden({
  light: 'Light',
  dark: 'Dark',
  'high-contrast-light': 'High Contrast Light',
  'high-contrast-dark': 'High Contrast Dark',
});

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
 * @param {object} options
 * @param {HTMLElement} options.$container - Container element for the picker
 * @param {ColorScheme} [options.initialValue] - Initial scheme value
 * @returns {SchemePickerAPI}
 */
export const createSchemePicker = ({ $container, initialValue = 'auto' }) => {
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
   * Render a captioned preview cell.
   *
   * @param {keyof typeof SCHEME_COLORS} schemeKey
   * @returns {string}
   */
  const renderCell = schemeKey => {
    const isSelected = selected === schemeKey;
    return `<div class="scheme-cell ${isSelected ? 'selected' : ''}" data-scheme="${schemeKey}">
      ${renderPreview(schemeKey)}
      <div class="scheme-cell-caption">${SCHEME_LABELS[schemeKey]}</div>
    </div>`;
  };

  /**
   * Render the picker into the container.
   */
  const render = () => {
    $container.innerHTML = `<div class="scheme-picker">
      <label>Color Scheme</label>
      <button type="button" class="scheme-auto ${selected === 'auto' ? 'selected' : ''}" data-scheme="auto">Auto (follow system)</button>
      <div class="scheme-grid">
        ${renderCell('light')}
        ${renderCell('dark')}
        ${renderCell('high-contrast-light')}
        ${renderCell('high-contrast-dark')}
      </div>
    </div>`;

    /**
     * Handle a scheme selection.
     *
     * @param {ColorScheme} scheme
     */
    const select = scheme => {
      selected = scheme;
      applyScheme(scheme);
      render();
      notifyChange();
    };

    // Attach click listeners
    const $auto = $container.querySelector('.scheme-auto');
    if ($auto) {
      $auto.addEventListener('click', () => select('auto'));
    }

    const $cells = $container.querySelectorAll('.scheme-cell');
    for (const $cell of $cells) {
      $cell.addEventListener('click', () => {
        const scheme = /** @type {ColorScheme | null} */ (
          $cell.getAttribute('data-scheme')
        );
        if (scheme && ALL_SCHEMES.includes(scheme)) {
          select(scheme);
        }
      });
    }
  };

  render();

  return harden({
    getValue: () => selected,
    setValue: (/** @type {ColorScheme} */ scheme) => {
      if (ALL_SCHEMES.includes(scheme)) {
        selected = scheme;
        applyScheme(scheme);
        render();
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
