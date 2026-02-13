// @ts-check

import { getCategories, getCommandsByCategory } from './command-registry.js';

/**
 * @typedef {object} HelpModalAPI
 * @property {() => void} show - Show the help modal
 * @property {() => void} hide - Hide the help modal
 * @property {() => boolean} isVisible - Check if modal is visible
 */

/**
 * Category display names.
 */
const CATEGORY_LABELS = {
  messaging: 'Messaging',
  execution: 'Execution',
  storage: 'Naming & Storage',
  connections: 'Connections',
  workers: 'Workers',
  agents: 'Hosts & Guests',
  bundles: 'Bundles',
  system: 'System',
};

/**
 * Create the help modal component.
 *
 * @param {object} options
 * @param {HTMLElement} options.$container - Container element for the modal
 * @param {() => void} options.onClose - Called when modal is closed
 * @returns {HelpModalAPI}
 */
export const createHelpModal = ({ $container, onClose }) => {
  let visible = false;

  /**
   * Render the help content.
   */
  const render = () => {
    const categories = getCategories();

    let html = `
      <div class="help-modal">
        <div class="help-header">
          <h2 class="help-title">Commands</h2>
          <button class="help-close" title="Close (Esc)">&times;</button>
        </div>
        <div class="help-content">
    `;

    for (const category of categories) {
      const label = CATEGORY_LABELS[category] || category;
      const commands = getCommandsByCategory(category);

      html += `
        <div class="help-category">
          <h3 class="help-category-title">${label}</h3>
          <div class="help-commands">
      `;

      for (const cmd of commands) {
        const aliases = cmd.aliases ? ` (${cmd.aliases.join(', ')})` : '';
        html += `
          <div class="help-command">
            <span class="help-command-name">/${cmd.name}${aliases}</span>
            <span class="help-command-desc">${cmd.description}</span>
          </div>
        `;
      }

      html += `
          </div>
        </div>
      `;
    }

    html += `
        </div>
        <div class="help-footer">
          <kbd>Esc</kbd> to close
        </div>
      </div>
    `;

    $container.innerHTML = html;

    // Attach close button listener
    const $close = $container.querySelector('.help-close');
    if ($close) {
      $close.addEventListener('click', () => {
        hide(); // eslint-disable-line no-use-before-define
        onClose();
      });
    }
  };

  /**
   * Show the help modal.
   */
  const show = () => {
    visible = true;
    render();
    $container.style.display = 'flex';
  };

  /**
   * Hide the help modal.
   */
  const hide = () => {
    visible = false;
    $container.style.display = 'none';
  };

  /**
   * Check if modal is visible.
   * @returns {boolean}
   */
  const isVisible = () => visible;

  // Initial state
  $container.innerHTML = '';
  $container.style.display = 'none';

  return { show, hide, isVisible };
};
