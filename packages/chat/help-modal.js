// @ts-check
/* eslint-disable no-use-before-define */

import harden from '@endo/harden';

/** @import { CommandDefinition } from './command-registry.js' */

import { Fragment, h, renderConfined } from './setup-preact-container.js';

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
const CATEGORY_LABELS = harden({
  messaging: 'Messaging',
  execution: 'Execution',
  storage: 'Naming & Storage',
  connections: 'Connections',
  workers: 'Workers',
  agents: 'Hosts & Guests',
  bundles: 'Bundles',
  profile: 'Profile',
  system: 'System',
});

/**
 * The overview listing all commands by category. Clicking a command row drills
 * into its detail view via `onSelectCommand`.
 *
 * @param {object} props
 * @param {(name: string) => void} props.onSelectCommand
 * @returns {import('preact').VNode}
 */
const HelpOverview = ({ onSelectCommand }) => {
  const categories = getCategories();

  return h(
    Fragment,
    null,
    ...categories.map(category => {
      const label = CATEGORY_LABELS[category] || category;
      const commands = getCommandsByCategory(category);
      return h(
        'div',
        { class: 'help-category', key: category },
        h('h3', { class: 'help-category-title' }, label),
        h(
          'div',
          { class: 'help-commands' },
          ...commands.map(cmd => {
            const aliases = cmd.aliases
              ? ` (${cmd.aliases.map(a => a).join(', ')})`
              : '';
            return h(
              'div',
              {
                class: 'help-command',
                'data-command': cmd.name,
                key: cmd.name,
                onClick: () => onSelectCommand(cmd.name),
              },
              h(
                'span',
                { class: 'help-command-name' },
                `/${cmd.name}${aliases}`,
              ),
              h('span', { class: 'help-command-desc' }, cmd.description),
            );
          }),
        ),
      );
    }),
    h(
      'div',
      { class: 'help-tip' },
      'Click a command or run ',
      h('code', null, '/help <command>'),
      ' for details.',
    ),
  );
};
harden(HelpOverview);

/**
 * The detail view for a single command.
 *
 * @param {object} props
 * @param {CommandDefinition} props.cmd
 * @returns {import('preact').VNode}
 */
const HelpDetail = ({ cmd }) => {
  const aliases = cmd.aliases
    ? cmd.aliases.map(a => `/${a}`).join(', ')
    : 'none';
  const categoryLabel = CATEGORY_LABELS[cmd.category] || cmd.category;

  /** @type {Array<import('preact').VNode>} */
  const metaRows = [
    h(
      'tr',
      { key: 'category' },
      h('td', { class: 'help-meta-label' }, 'Category'),
      h('td', null, categoryLabel),
    ),
    h(
      'tr',
      { key: 'aliases' },
      h('td', { class: 'help-meta-label' }, 'Aliases'),
      h('td', null, aliases),
    ),
  ];
  if (cmd.context && cmd.context !== 'both') {
    metaRows.push(
      h(
        'tr',
        { key: 'context' },
        h('td', { class: 'help-meta-label' }, 'Context'),
        h('td', null, `${cmd.context} only`),
      ),
    );
  }

  const paramsSection =
    cmd.fields.length > 0
      ? h(
          Fragment,
          null,
          h('h4', { class: 'help-detail-section' }, 'Parameters'),
          h(
            'table',
            { class: 'help-detail-fields' },
            h(
              'thead',
              null,
              h(
                'tr',
                null,
                h('th', null, 'Name'),
                h('th', null, 'Required'),
                h('th', null, 'Description'),
              ),
            ),
            h(
              'tbody',
              null,
              ...cmd.fields.map(field =>
                h(
                  'tr',
                  { key: field.name },
                  h('td', null, h('code', null, field.name)),
                  h('td', null, field.required ? 'yes' : 'no'),
                  h(
                    'td',
                    null,
                    field.label,
                    field.placeholder
                      ? h(
                          'span',
                          { class: 'help-field-hint' },
                          ` (${field.placeholder})`,
                        )
                      : null,
                  ),
                ),
              ),
            ),
          ),
        )
      : h('p', { class: 'help-detail-no-params' }, 'No parameters.');

  return h(
    'div',
    { class: 'help-detail' },
    h('h3', { class: 'help-detail-name' }, `/${cmd.name}`),
    h('p', { class: 'help-detail-desc' }, cmd.description),
    h('table', { class: 'help-detail-meta' }, ...metaRows),
    paramsSection,
  );
};
harden(HelpDetail);

/**
 * The confined modal body — a pure function of `state` plus controller
 * callbacks. Host DOM nodes never enter this tree.
 *
 * @param {object} props
 * @param {boolean} props.visible - Whether the modal is shown.
 * @param {string} [props.commandName] - Command whose detail to show.
 * @param {(name: string) => void} props.onSelectCommand - Drill into a command.
 * @param {() => void} props.onBack - Return to the overview.
 * @param {() => void} props.onClose - Close the modal.
 * @returns {import('preact').VNode | null}
 */
const HelpModalBody = ({
  visible,
  commandName,
  onSelectCommand,
  onBack,
  onClose,
}) => {
  if (!visible) return null;

  // Strip leading slash if the user typed "/show" instead of "show".
  const normalized = commandName
    ? commandName.replace(/^\//, '').trim()
    : undefined;
  const cmd = normalized ? getCommand(normalized) : undefined;
  const showingDetail = !!(normalized && cmd);
  const notFound = !!(normalized && !cmd);

  let body;
  if (notFound) {
    body = h(
      Fragment,
      null,
      h(
        'p',
        { class: 'help-not-found' },
        'Unknown command ',
        h('code', null, `/${normalized}`),
        '.',
      ),
      h(HelpOverview, { onSelectCommand }),
    );
  } else if (showingDetail) {
    body = h(HelpDetail, { cmd });
  } else {
    body = h(HelpOverview, { onSelectCommand });
  }

  const title = showingDetail ? `/${cmd.name}` : 'Commands';

  return h(
    'div',
    { class: 'help-modal' },
    h(
      'div',
      { class: 'help-header' },
      showingDetail
        ? h(
            'button',
            { class: 'help-back', title: 'Back to overview', onClick: onBack },
            '←',
          )
        : null,
      h('h2', { class: 'help-title' }, title),
      h(
        'button',
        { class: 'help-close', title: 'Close (Esc)', onClick: onClose },
        '×',
      ),
    ),
    h('div', { class: 'help-content' }, body),
    h('div', { class: 'help-footer' }, h('kbd', null, 'Esc'), ' to close'),
  );
};
harden(HelpModalBody);

/**
 * Create the help modal component. The body is one confined Preact tree
 * rendered through a single `renderConfined` into a dedicated mount inside
 * `$container`; `show(commandName?)` opens it and `hide()` closes it.
 *
 * @param {object} options
 * @param {HTMLElement} options.$container - Container element for the modal
 * @param {() => void} options.onClose - Called when modal is closed
 * @returns {HelpModalAPI}
 */
export const createHelpModal = ({ $container, onClose }) => {
  // Dedicated confined mount; siblings of `$container` are never reconciled.
  // `display: contents` keeps the modal's own flex layout (on `$container`)
  // applying to the mount's children.
  const $mount = document.createElement('div');
  $mount.style.display = 'contents';

  let visible = false;
  /** @type {string | undefined} */
  let currentCommand;

  /**
   * Render the confined modal body for the current state.
   */
  const rerender = () => {
    renderConfined(
      h(HelpModalBody, {
        visible,
        commandName: currentCommand,
        onSelectCommand: name => {
          currentCommand = name;
          rerender();
        },
        onBack: () => {
          currentCommand = undefined;
          rerender();
        },
        onClose: () => {
          hide();
          onClose();
        },
      }),
      $mount,
    );
  };

  /**
   * Show the help modal.
   *
   * @param {string} [commandName] - Optional command to show details for
   */
  const show = commandName => {
    visible = true;
    currentCommand = commandName;
    rerender();
    $container.style.display = 'flex';
  };

  /**
   * Hide the help modal.
   */
  const hide = () => {
    visible = false;
    currentCommand = undefined;
    rerender();
    $container.style.display = 'none';
  };

  /**
   * Check if modal is visible.
   * @returns {boolean}
   */
  const isVisible = () => visible;

  // Initial state: mounted but closed.
  $container.innerHTML = '';
  $container.appendChild($mount);
  $container.style.display = 'none';
  rerender();

  return harden({ show, hide, isVisible });
};
harden(createHelpModal);
