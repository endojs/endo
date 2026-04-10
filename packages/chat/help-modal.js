// @ts-check

import {
  getCategories,
  getCommand,
  getCommandsByCategory,
} from './command-registry.js';

/**
 * @typedef {object} HelpModalAPI
 * @property {(commandName?: string) => void} show - Show the help modal
 * @property {() => void} hide - Hide the help modal
 * @property {() => boolean} isVisible - Check if modal is visible
 */

/**
 * Category display names.
 * @type {Record<string, string>}
 */
const CATEGORY_LABELS = {
  messaging: 'Messaging',
  execution: 'Execution',
  storage: 'Naming & Storage',
  connections: 'Connections',
  workers: 'Workers',
  agents: 'Hosts & Guests',
  bundles: 'Bundles',
  profile: 'Profile',
  system: 'System',
};

/**
 * Escape HTML special characters.
 *
 * @param {string} str
 * @returns {string}
 */
const escapeHtml = str =>
  str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Render the overview listing all commands by category.
 *
 * @returns {string}
 */
const renderOverview = () => {
  const categories = getCategories();
  let html = '';

  for (const category of categories) {
    const label = CATEGORY_LABELS[category] || category;
    const commands = getCommandsByCategory(category);

    html += `
      <div class="help-category">
        <h3 class="help-category-title">${escapeHtml(label)}</h3>
        <div class="help-commands">
    `;

    for (const cmd of commands) {
      const aliases = cmd.aliases
        ? ` (${cmd.aliases.map(a => escapeHtml(a)).join(', ')})`
        : '';
      html += `
        <div class="help-command" data-command="${escapeHtml(cmd.name)}">
          <span class="help-command-name">/${escapeHtml(cmd.name)}${aliases}</span>
          <span class="help-command-desc">${escapeHtml(cmd.description)}</span>
        </div>
      `;
    }

    html += `
        </div>
      </div>
    `;
  }

  html += `
    <div class="help-tip">
      Click a command or run <code>/help &lt;command&gt;</code> for details.
    </div>
  `;

  return html;
};

/**
 * Render the detail view for a single command.
 *
 * @param {import('./command-registry.js').CommandDefinition} cmd
 * @returns {string}
 */
const renderDetail = cmd => {
  const aliases = cmd.aliases
    ? cmd.aliases.map(a => `/${escapeHtml(a)}`).join(', ')
    : 'none';
  const categoryLabel =
    CATEGORY_LABELS[cmd.category] || cmd.category;

  let html = `
    <div class="help-detail">
      <h3 class="help-detail-name">/${escapeHtml(cmd.name)}</h3>
      <p class="help-detail-desc">${escapeHtml(cmd.description)}</p>
      <table class="help-detail-meta">
        <tr><td class="help-meta-label">Category</td><td>${escapeHtml(categoryLabel)}</td></tr>
        <tr><td class="help-meta-label">Aliases</td><td>${aliases}</td></tr>
  `;

  if (cmd.context && cmd.context !== 'both') {
    html += `<tr><td class="help-meta-label">Context</td><td>${escapeHtml(cmd.context)} only</td></tr>`;
  }

  html += `</table>`;

  if (cmd.fields.length > 0) {
    html += `
      <h4 class="help-detail-section">Parameters</h4>
      <table class="help-detail-fields">
        <thead>
          <tr>
            <th>Name</th>
            <th>Required</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
    `;
    for (const field of cmd.fields) {
      const req = field.required ? 'yes' : 'no';
      const placeholder = field.placeholder
        ? ` <span class="help-field-hint">(${escapeHtml(field.placeholder)})</span>`
        : '';
      html += `
        <tr>
          <td><code>${escapeHtml(field.name)}</code></td>
          <td>${req}</td>
          <td>${escapeHtml(field.label)}${placeholder}</td>
        </tr>
      `;
    }
    html += `
        </tbody>
      </table>
    `;
  } else {
    html += `<p class="help-detail-no-params">No parameters.</p>`;
  }

  html += `</div>`;
  return html;
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
   *
   * @param {string} [commandName] - If provided, show detail for this command
   */
  const render = commandName => {
    // Strip leading slash if the user typed "/show" instead of "show"
    const normalized = commandName
      ? commandName.replace(/^\//, '').trim()
      : undefined;

    const cmd = normalized ? getCommand(normalized) : undefined;
    const showingDetail = !!(normalized && cmd);
    const notFound = !!(normalized && !cmd);

    let body = '';

    if (notFound) {
      body = `<p class="help-not-found">Unknown command <code>/${escapeHtml(normalized)}</code>.</p>`;
      body += renderOverview();
    } else if (showingDetail) {
      body = renderDetail(cmd);
    } else {
      body = renderOverview();
    }

    const title = showingDetail ? `/${escapeHtml(cmd.name)}` : 'Commands';
    const backButton = showingDetail
      ? `<button class="help-back" title="Back to overview">&larr;</button>`
      : '';

    const html = `
      <div class="help-modal">
        <div class="help-header">
          ${backButton}
          <h2 class="help-title">${title}</h2>
          <button class="help-close" title="Close (Esc)">&times;</button>
        </div>
        <div class="help-content">
          ${body}
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

    // Attach back button listener
    const $back = $container.querySelector('.help-back');
    if ($back) {
      $back.addEventListener('click', () => {
        render();
      });
    }

    // Attach click-to-detail on command rows
    const $rows = $container.querySelectorAll('.help-command[data-command]');
    for (const $row of $rows) {
      $row.addEventListener('click', () => {
        const name = /** @type {HTMLElement} */ ($row).dataset.command;
        if (name) render(name);
      });
    }
  };

  /**
   * Show the help modal.
   *
   * @param {string} [commandName] - Optional command to show details for
   */
  const show = commandName => {
    visible = true;
    render(commandName);
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
