// @ts-check
/* global document */
/* eslint-disable no-use-before-define */

import harden from '@endo/harden';

/** @import { ColorScheme } from './spaces-gutter.js' */
/** @import { PetNamePathsAutocompleteAPI } from './petname-paths-autocomplete.js' */
/** @import { ERef } from '@endo/far' */
/** @import { EndoHost } from '@endo/daemon' */

import { E } from '@endo/far';
import { ALL_ICONS, letterIcon, renderIconSelector } from './icon-selector.js';
import { petNamePathsAutocomplete } from './petname-paths-autocomplete.js';
import { createSchemePicker } from './scheme-picker.js';

const WHYLIP_SYSTEM_PROMPT = `\
You are The Whylip Primer — an interactive illustrated primer that teaches \
through story and interactive experience.

You communicate via the reply tool. When you receive a message, use the \
reply tool and set the strings parameter to a single JSON object:
{
  "narrative": "markdown prose explaining the concept",
  "scene": {
    "title": "Scene title",
    "html": "<!-- fully self-contained HTML+CSS+JS document for an iframe -->"
  }
}

Set scene to null if no interactive visualization is needed for this response.

IMPORTANT: The JSON object must be the ONLY content in your reply. Do not \
include any text before or after the JSON. Do not wrap it in code fences. \
After replying, dismiss the message and stop — do not output anything else.

Scene HTML must be fully self-contained (inline CSS + JS, no external requests). \
Use canvas, SVG, or DOM manipulation to create interactive visualizations. \
The scene runs in a sandboxed iframe with no network access.`;

/**
 * @typedef {object} AddSpaceModalAPI
 * @property {() => void} show - Show the modal
 * @property {() => void} hide - Hide the modal
 * @property {() => boolean} isVisible - Check if modal is visible
 */

/**
 * @typedef {object} SpaceFormData
 * @property {string} name - Display name for the space
 * @property {string} icon - Emoji or letter icon
 * @property {string[]} profilePath - Pet name path to the profile
 * @property {'mailbox' | 'channel' | 'whylip' | 'graph' | 'peers'} layout - Layout type
 * @property {ColorScheme} [scheme] - Color scheme preference
 * @property {string} [channelPetName] - Pet name for the channel object (channel mode)
 * @property {string} [proposedName] - Display name for the channel creator
 * @property {string} [whylipSystemPrompt] - System prompt override for Whylip mode
 * @property {'chat' | 'forum'} [viewMode] - Channel view mode (default: 'chat')
 * @property {boolean} [ownedPersona] - Whether the space owns the persona (for cleanup)
 */

/**
 * Create the add space modal component.
 *
 * @param {object} options
 * @param {HTMLElement} options.$container - Container element for the modal
 * @param {unknown} options.powers - Endo host powers
 * @param {() => Set<string>} options.getUsedIcons - Returns set of icons already in use
 * @param {(data: SpaceFormData) => Promise<void>} options.onSubmit - Called when form is submitted
 * @param {() => void} options.onClose - Called when modal is closed
 * @param {() => Array<{ id: string, name: string, icon: string, profilePath: string[] }>} [options.getExistingChannelSpaces] - Returns existing channel spaces for reuse
 * @returns {AddSpaceModalAPI}
 */
export const createAddSpaceModal = ({
  $container,
  powers,
  getUsedIcons,
  onSubmit,
  onClose,
  getExistingChannelSpaces,
}) => {
  /**
   * Get the first unused icon from the available icons.
   * @returns {string}
   */
  const getFirstUnusedIcon = () => {
    const usedIcons = getUsedIcons();
    for (const icon of ALL_ICONS) {
      if (!usedIcons.has(icon)) {
        return icon;
      }
    }
    // All icons used, return first one
    return ALL_ICONS[0];
  };

  let visible = false;
  /** @type {'choose' | 'new-agent' | 'existing' | 'new-channel' | 'connect-channel' | 'whylip' | 'graph' | 'peers'} */
  let mode = 'choose';
  /** @type {string} */
  let whylipName = '';
  /** @type {string} */
  let whylipAgentName = '';
  let selectedIcon = '🐈‍⬛';
  let useLetterIcon = false;
  /** @type {string} */
  let handleName = '';
  /** @type {string} */
  let agentName = '';
  /** @type {boolean} */
  let agentNameManuallyEdited = false;
  /** @type {string} */
  let channelPetName = '';
  /** @type {string} */
  let channelProposedName = '';
  /** @type {'chat' | 'forum' | 'outliner'} */
  let channelViewMode = 'chat';
  /** @type {'new' | 'existing'} */
  let channelPersonaMode = 'new';
  /** @type {PetNamePathsAutocompleteAPI | null} */
  let channelPathAutocomplete = null;
  /** @type {string} */
  let connectLocator = '';
  /** @type {string} */
  let connectSpaceName = '';
  /** @type {string} */
  let connectProposedName = '';
  /** @type {'new' | 'existing'} */
  let connectPersonaMode = 'new';
  /** @type {string | null} */
  let connectExistingSpaceId = null;
  /** @type {string | null} */
  let error = null;
  /** @type {boolean} */
  let isSubmitting = false;

  /** @type {PetNamePathsAutocompleteAPI | null} */
  let pathAutocomplete = null;

  /** @type {import('./scheme-picker.js').SchemePickerAPI | null} */
  let schemePicker = null;

  /**
   * Render the choose mode screen.
   * @returns {string}
   */
  const renderChooseMode = () => {
    const nextIcon = getFirstUnusedIcon();
    return `
    <div class="add-space-backdrop"></div>
    <div class="add-space-modal">
      <div class="add-space-header">
        <h2 class="add-space-title">Add Space</h2>
        <button type="button" class="add-space-close" title="Close (Esc)">&times;</button>
      </div>
      <div class="add-space-choose">
        <button type="button" class="space-type-card" data-mode="new-agent">
          <span class="space-type-icon">${nextIcon}</span>
          <span class="space-type-title">New Profile</span>
          <span class="space-type-desc">Create a fresh profile</span>
        </button>
        <button type="button" class="space-type-card" data-mode="existing">
          <span class="space-type-icon">🐈‍⬛</span>
          <span class="space-type-title">Existing Profile</span>
          <span class="space-type-desc">Connect to an existing profile</span>
        </button>
        <button type="button" class="space-type-card" data-mode="new-channel">
          <span class="space-type-icon">📡</span>
          <span class="space-type-title">New Channel</span>
          <span class="space-type-desc">Create a multi-party chat room</span>
        </button>
        <button type="button" class="space-type-card" data-mode="connect-channel">
          <span class="space-type-icon">🔗</span>
          <span class="space-type-title">Connect to Channel</span>
          <span class="space-type-desc">Join a channel via invitation link</span>
        </button>
        <button type="button" class="space-type-card" data-mode="whylip">
          <span class="space-type-icon">📖</span>
          <span class="space-type-title">Whylip Book</span>
          <span class="space-type-desc">An interactive illustrated primer powered by a Fae agent</span>
        </button>
        <button type="button" class="space-type-card" data-mode="graph">
          <span class="space-type-icon">🕸️</span>
          <span class="space-type-title">Inventory Graph</span>
          <span class="space-type-desc">Visualize your pet store as a force-directed graph</span>
        </button>
        <button type="button" class="space-type-card" data-mode="peers">
          <span class="space-type-icon">🌐</span>
          <span class="space-type-title">Known Peers</span>
          <span class="space-type-desc">List all known remote Endo peers and connection hints</span>
        </button>
      </div>
    </div>
  `;
  };

  /**
   * Get the default agent name for a handle.
   * @param {string} handle
   * @returns {string}
   */
  const getDefaultAgentName = handle => {
    return handle ? `profile-for-${handle}` : '';
  };

  /**
   * Render the new agent form.
   * @returns {string}
   */
  const renderNewAgentForm = () => {
    const displayAgentName = agentNameManuallyEdited
      ? agentName
      : getDefaultAgentName(handleName);
    return `
    <div class="add-space-backdrop"></div>
    <div class="add-space-modal">
      <div class="add-space-header">
        <button type="button" class="add-space-back" title="Back">←</button>
        <h2 class="add-space-title">New Profile</h2>
        <button type="button" class="add-space-close" title="Close (Esc)">&times;</button>
      </div>
      <form class="add-space-form">
        <div class="add-space-field">
          <label for="handle-name">Handle</label>
          <input type="text" id="handle-name" placeholder="e.g., clark, bruce, diana"
                 value="${handleName}" autocomplete="off" />
          <div class="field-hint">The pet name for accessing this profile's powers</div>
        </div>

        <div class="add-space-field">
          <label for="agent-name">Agent Name</label>
          <input type="text" id="agent-name" placeholder="profile-for-handle"
                 value="${displayAgentName}" autocomplete="off" />
          <div class="field-hint">Internal identifier for the agent</div>
        </div>

        ${renderIconSelector({ selectedIcon, useLetterIcon })}

        <div class="add-space-field">
          <label>Layout</label>
          <div class="layout-selector">
            <button type="button" class="layout-option selected" data-layout="mailbox">
              <span class="layout-icon">📬</span>
              <span class="layout-name">Mailbox</span>
            </button>
          </div>
          <div class="field-hint">More layouts coming soon</div>
        </div>

        <div id="scheme-picker-slot" class="add-space-field"></div>

        ${error ? `<div class="add-space-error">${error}</div>` : ''}

        <div class="add-space-actions">
          <button type="button" class="add-space-cancel">Cancel</button>
          <button type="submit" class="add-space-submit" ${isSubmitting ? 'disabled' : ''}>
            ${isSubmitting ? 'Creating...' : 'Create Space'}
          </button>
        </div>
      </form>
    </div>
  `;
  };

  /**
   * Render the existing profile form.
   * @returns {string}
   */
  const renderExistingForm = () => `
    <div class="add-space-backdrop"></div>
    <div class="add-space-modal">
      <div class="add-space-header">
        <button type="button" class="add-space-back" title="Back">←</button>
        <h2 class="add-space-title">Existing Profile</h2>
        <button type="button" class="add-space-close" title="Close (Esc)">&times;</button>
      </div>
      <form class="add-space-form">
        ${renderIconSelector({ selectedIcon, useLetterIcon })}

        <div class="add-space-field">
          <label>Profile Path</label>
          <div class="petname-path-selector">
            <div id="profile-path-input" class="profile-path-input-container"></div>
            <div id="profile-path-menu" class="token-menu"></div>
          </div>
          <div class="field-hint">Use <kbd>.</kbd> to drill down, <kbd>Enter</kbd> to add space</div>
        </div>

        <div class="add-space-field">
          <label>Layout</label>
          <div class="layout-selector">
            <button type="button" class="layout-option selected" data-layout="mailbox">
              <span class="layout-icon">📬</span>
              <span class="layout-name">Mailbox</span>
            </button>
          </div>
          <div class="field-hint">More layouts coming soon</div>
        </div>

        <div id="scheme-picker-slot" class="add-space-field"></div>

        ${error ? `<div class="add-space-error">${error}</div>` : ''}

        <div class="add-space-actions">
          <button type="button" class="add-space-cancel">Cancel</button>
          <button type="submit" class="add-space-submit" ${isSubmitting ? 'disabled' : ''}>
            ${isSubmitting ? 'Adding...' : 'Add Space'}
          </button>
        </div>
      </form>
    </div>
  `;

  /**
   * Render the new channel form.
   * @returns {string}
   */
  const renderNewChannelForm = () => `
    <div class="add-space-backdrop"></div>
    <div class="add-space-modal">
      <div class="add-space-header">
        <button type="button" class="add-space-back" title="Back">←</button>
        <h2 class="add-space-title">New Channel</h2>
        <button type="button" class="add-space-close" title="Close (Esc)">&times;</button>
      </div>
      <form class="add-space-form">
        <div class="add-space-field">
          <label>Persona</label>
          <div class="connect-persona-choices">
            <label class="connect-persona-option">
              <input type="radio" name="channel-persona-mode" value="new"
                     ${channelPersonaMode === 'new' ? 'checked' : ''} />
              <span>Create new persona</span>
            </label>
            <label class="connect-persona-option">
              <input type="radio" name="channel-persona-mode" value="existing"
                     ${channelPersonaMode === 'existing' ? 'checked' : ''} />
              <span>Use existing profile</span>
            </label>
          </div>
        </div>

        ${
          channelPersonaMode === 'existing'
            ? `
          <div class="add-space-field">
            <label>Profile Path</label>
            <div class="petname-path-selector">
              <div id="channel-profile-path-input" class="profile-path-input-container"></div>
              <div id="channel-profile-path-menu" class="token-menu"></div>
            </div>
            <div class="field-hint">Use <kbd>.</kbd> to drill down, <kbd>Enter</kbd> to select</div>
          </div>
        `
            : ''
        }

        ${renderIconSelector({ selectedIcon, useLetterIcon })}

        <div class="add-space-field">
          <label for="channel-pet-name">Space Name</label>
          <input type="text" id="channel-pet-name" placeholder="e.g., general, dev-chat"
                 pattern="[a-z][a-z0-9-]*"
                 value="${channelPetName}" autocomplete="off" />
          <div class="field-hint">Lowercase letters, numbers, and hyphens only (e.g., my-team)</div>
        </div>

        <div class="add-space-field">
          <label for="channel-proposed-name">Your Display Name</label>
          <input type="text" id="channel-proposed-name" placeholder="e.g., Alice, Admin"
                 value="${channelProposedName}" autocomplete="off" />
          <div class="field-hint">How others will see you in this channel</div>
        </div>

        <div class="add-space-field">
          <label>Channel View</label>
          <div class="view-mode-selector">
            <button type="button" class="view-mode-option ${channelViewMode === 'chat' ? 'selected' : ''}" data-view-mode="chat">
              <span class="view-mode-label">Traditional Chat</span>
              <span class="view-mode-desc">Chronological messages with thread drill-downs</span>
            </button>
            <button type="button" class="view-mode-option ${channelViewMode === 'forum' ? 'selected' : ''}" data-view-mode="forum">
              <span class="view-mode-label">Forum</span>
              <span class="view-mode-desc">Threaded tree view with active subtrees at bottom</span>
            </button>
            <button type="button" class="view-mode-option ${channelViewMode === 'outliner' ? 'selected' : ''}" data-view-mode="outliner">
              <span class="view-mode-label">Outliner</span>
              <span class="view-mode-desc">Collaborative document with edit history</span>
            </button>
          </div>
        </div>

        ${error ? `<div class="add-space-error">${error}</div>` : ''}

        <div class="add-space-actions">
          <button type="button" class="add-space-cancel">Cancel</button>
          <button type="submit" class="add-space-submit" ${isSubmitting ? 'disabled' : ''}>
            ${isSubmitting ? 'Creating...' : 'Create Channel'}
          </button>
        </div>
      </form>
    </div>
  `;

  /**
   * Render the connect to channel form.
   * @returns {string}
   */
  const renderConnectChannelForm = () => {
    const existingSpaces = getExistingChannelSpaces
      ? getExistingChannelSpaces()
      : [];

    const existingSpacesHtml = existingSpaces
      .map(
        s => `
        <label class="connect-persona-option">
          <input type="radio" name="connect-persona" value="${s.id}"
                 ${connectExistingSpaceId === s.id ? 'checked' : ''} />
          <span class="connect-persona-icon">${s.icon}</span>
          <span class="connect-persona-name">${s.name}</span>
        </label>`,
      )
      .join('');

    return `
    <div class="add-space-backdrop"></div>
    <div class="add-space-modal">
      <div class="add-space-header">
        <button type="button" class="add-space-back" title="Back">\u2190</button>
        <h2 class="add-space-title">Connect to Channel</h2>
        <button type="button" class="add-space-close" title="Close (Esc)">&times;</button>
      </div>
      <form class="add-space-form">
        <div class="add-space-field">
          <label for="connect-locator">Invitation Locator</label>
          <input type="text" id="connect-locator" placeholder="endo://\u2026"
                 value="${connectLocator}" autocomplete="off" />
          <div class="field-hint">Paste the invitation link you received</div>
        </div>

        <div class="add-space-field">
          <label>Persona</label>
          <div class="connect-persona-choices">
            <label class="connect-persona-option">
              <input type="radio" name="connect-persona-mode" value="new"
                     ${connectPersonaMode === 'new' ? 'checked' : ''} />
              <span>Create new persona</span>
            </label>
            ${
              existingSpaces.length > 0
                ? `<label class="connect-persona-option">
                <input type="radio" name="connect-persona-mode" value="existing"
                       ${connectPersonaMode === 'existing' ? 'checked' : ''} />
                <span>Use existing persona</span>
              </label>`
                : ''
            }
          </div>
        </div>

        ${
          connectPersonaMode === 'new'
            ? `
          ${renderIconSelector({ selectedIcon, useLetterIcon })}
          <div class="add-space-field">
            <label for="connect-space-name">Space Name</label>
            <input type="text" id="connect-space-name" placeholder="e.g., team-chat"
                   pattern="[a-z][a-z0-9-]*"
                   value="${connectSpaceName}" autocomplete="off" />
            <div class="field-hint">Lowercase letters, numbers, and hyphens only (e.g., my-team)</div>
          </div>
          <div class="add-space-field">
            <label for="connect-proposed-name">Your Display Name</label>
            <input type="text" id="connect-proposed-name" placeholder="e.g., Alice"
                   value="${connectProposedName}" autocomplete="off" />
            <div class="field-hint">How others will see you in this channel</div>
          </div>
        `
            : `
          <div class="add-space-field">
            <label>Choose a persona</label>
            <div class="connect-existing-list">
              ${existingSpacesHtml || '<div class="field-hint">No existing channel spaces found</div>'}
            </div>
          </div>
        `
        }

        ${error ? `<div class="add-space-error">${error}</div>` : ''}

        <div class="add-space-actions">
          <button type="button" class="add-space-cancel">Cancel</button>
          <button type="submit" class="add-space-submit" ${isSubmitting ? 'disabled' : ''}>
            ${isSubmitting ? 'Connecting...' : 'Connect'}
          </button>
        </div>
      </form>
    </div>
  `;
  };

  /**
   * Render the Whylip Book form.
   * @returns {string}
   */
  const renderWhylipForm = () => `
    <div class="add-space-backdrop"></div>
    <div class="add-space-modal">
      <div class="add-space-header">
        <button type="button" class="add-space-back" title="Back">\u2190</button>
        <h2 class="add-space-title">Whylip Book</h2>
        <button type="button" class="add-space-close" title="Close (Esc)">&times;</button>
      </div>
      <form class="add-space-form">
        <div class="add-space-field">
          <label for="whylip-name">Book Name</label>
          <input type="text" id="whylip-name" placeholder="e.g., physics-primer"
                 pattern="[a-zA-Z][a-zA-Z0-9_-]*"
                 value="${whylipName}" autocomplete="off" />
          <div class="field-hint">A short name for this primer (letters, numbers, hyphens)</div>
        </div>

        <div class="add-space-field">
          <label for="whylip-agent-name">Fae Factory</label>
          <input type="text" id="whylip-agent-name" placeholder="e.g., fae-factory"
                 value="${whylipAgentName}" autocomplete="off" />
          <div class="field-hint">Pet name of the Fae factory controller (from <code>endo list</code>)</div>
        </div>

        ${renderIconSelector({ selectedIcon, useLetterIcon })}

        <div id="scheme-picker-slot" class="add-space-field"></div>

        ${error ? `<div class="add-space-error">${error}</div>` : ''}

        <div class="add-space-actions">
          <button type="button" class="add-space-cancel">Cancel</button>
          <button type="submit" class="add-space-submit" ${isSubmitting ? 'disabled' : ''}>
            ${isSubmitting ? 'Creating...' : 'Create Book'}
          </button>
        </div>
      </form>
    </div>
  `;

  /**
   * Render the inventory graph form.
   * @returns {string}
   */
  const renderGraphForm = () => `
    <div class="add-space-backdrop"></div>
    <div class="add-space-modal">
      <div class="add-space-header">
        <button type="button" class="add-space-back" title="Back">\u2190</button>
        <h2 class="add-space-title">Inventory Graph</h2>
        <button type="button" class="add-space-close" title="Close (Esc)">&times;</button>
      </div>
      <form class="add-space-form">
        ${renderIconSelector({ selectedIcon, useLetterIcon })}

        <div class="add-space-field">
          <label>Profile Path</label>
          <div class="petname-path-selector">
            <div id="profile-path-input" class="profile-path-input-container"></div>
            <div id="profile-path-menu" class="token-menu"></div>
          </div>
          <div class="field-hint">Use <kbd>.</kbd> to drill down, <kbd>Enter</kbd> to add space</div>
        </div>

        <div id="scheme-picker-slot" class="add-space-field"></div>

        ${error ? `<div class="add-space-error">${error}</div>` : ''}

        <div class="add-space-actions">
          <button type="button" class="add-space-cancel">Cancel</button>
          <button type="submit" class="add-space-submit" ${isSubmitting ? 'disabled' : ''}>
            ${isSubmitting ? 'Creating...' : 'Create Graph'}
          </button>
        </div>
      </form>
    </div>
  `;

  /**
   * Render the peers form.
   * @returns {string}
   */
  const renderPeersForm = () => `
    <div class="add-space-backdrop"></div>
    <div class="add-space-modal">
      <div class="add-space-header">
        <button type="button" class="add-space-back" title="Back">\u2190</button>
        <h2 class="add-space-title">Known Peers</h2>
        <button type="button" class="add-space-close" title="Close (Esc)">&times;</button>
      </div>
      <form class="add-space-form">
        ${renderIconSelector({ selectedIcon, useLetterIcon })}

        <div id="scheme-picker-slot" class="add-space-field"></div>

        ${error ? `<div class="add-space-error">${error}</div>` : ''}

        <div class="add-space-actions">
          <button type="button" class="add-space-cancel">Cancel</button>
          <button type="submit" class="add-space-submit" ${isSubmitting ? 'disabled' : ''}>
            ${isSubmitting ? 'Creating...' : 'Create Space'}
          </button>
        </div>
      </form>
    </div>
  `;

  /**
   * Render the modal content based on current mode.
   */
  const render = () => {
    let html;
    switch (mode) {
      case 'new-agent':
        html = renderNewAgentForm();
        break;
      case 'new-channel':
        html = renderNewChannelForm();
        break;
      case 'connect-channel':
        html = renderConnectChannelForm();
        break;
      case 'existing':
        html = renderExistingForm();
        break;
      case 'whylip':
        html = renderWhylipForm();
        break;
      case 'graph':
        html = renderGraphForm();
        break;
      case 'peers':
        html = renderPeersForm();
        break;
      default:
        html = renderChooseMode();
    }

    $container.innerHTML = html;
    attachEventListeners();

    // Mount scheme picker into slot if in a form mode
    if (
      mode === 'new-agent' ||
      mode === 'existing' ||
      mode === 'whylip' ||
      mode === 'graph' ||
      mode === 'peers'
    ) {
      const $slot = /** @type {HTMLElement | null} */ (
        $container.querySelector('#scheme-picker-slot')
      );
      if ($slot) {
        const previousValue = schemePicker ? schemePicker.getValue() : 'auto';
        schemePicker = createSchemePicker({
          $container: $slot,
          initialValue: previousValue,
        });
      }
    }

    if (mode === 'existing' || mode === 'graph') {
      initPathAutocomplete();
    }
    if (mode === 'new-channel' && channelPersonaMode === 'existing') {
      initChannelPathAutocomplete();
    }

    // Focus appropriate input
    if (mode === 'new-agent') {
      const $handleInput = /** @type {HTMLInputElement | null} */ (
        $container.querySelector('#handle-name')
      );
      if ($handleInput) {
        $handleInput.focus();
        $handleInput.setSelectionRange(
          $handleInput.value.length,
          $handleInput.value.length,
        );
      }
    }
    if (mode === 'new-channel') {
      const $channelPetNameInput = /** @type {HTMLInputElement | null} */ (
        $container.querySelector('#channel-pet-name')
      );
      if ($channelPetNameInput) {
        $channelPetNameInput.focus();
      }
    }
    if (mode === 'connect-channel') {
      const $locatorInput = /** @type {HTMLInputElement | null} */ (
        $container.querySelector('#connect-locator')
      );
      if ($locatorInput) {
        $locatorInput.focus();
      }
    }
    if (mode === 'whylip') {
      const $whylipNameInput = /** @type {HTMLInputElement | null} */ (
        $container.querySelector('#whylip-name')
      );
      if ($whylipNameInput) {
        $whylipNameInput.focus();
      }
    }
  };

  /**
   * Initialize the path autocomplete component.
   */
  const initPathAutocomplete = () => {
    const $inputContainer = $container.querySelector('#profile-path-input');
    const $menu = $container.querySelector('#profile-path-menu');

    if (!$inputContainer || !$menu) return;

    // Dispose previous instance if any
    if (pathAutocomplete) {
      pathAutocomplete.dispose();
    }

    const typedPowers = /** @type {ERef<EndoHost>} */ (powers);
    pathAutocomplete = petNamePathsAutocomplete(
      /** @type {HTMLElement} */ ($inputContainer),
      /** @type {HTMLElement} */ ($menu),
      {
        E,
        powers: typedPowers,
        onSubmit: () => {
          // Trigger form submission
          const $form = $container.querySelector('.add-space-form');
          if ($form instanceof HTMLFormElement) {
            $form.requestSubmit();
          }
        },
        // Selecting completes the chip; use Shift+Tab to go back and continue drilling
        finalizeOnSelect: true,
      },
    );

    // Set default path and focus
    pathAutocomplete.setValue(['@agent']);
    pathAutocomplete.focus();
  };

  /**
   * Initialize the channel profile path autocomplete component.
   */
  const initChannelPathAutocomplete = () => {
    const $inputContainer = $container.querySelector(
      '#channel-profile-path-input',
    );
    const $menu = $container.querySelector('#channel-profile-path-menu');

    if (!$inputContainer || !$menu) return;

    // Dispose previous instance if any
    if (channelPathAutocomplete) {
      channelPathAutocomplete.dispose();
    }

    const typedPowers = /** @type {ERef<EndoHost>} */ (powers);
    channelPathAutocomplete = petNamePathsAutocomplete(
      /** @type {HTMLElement} */ ($inputContainer),
      /** @type {HTMLElement} */ ($menu),
      {
        E,
        powers: typedPowers,
        onSubmit: () => {
          // Trigger form submission
          const $form = $container.querySelector('.add-space-form');
          if ($form instanceof HTMLFormElement) {
            $form.requestSubmit();
          }
        },
        finalizeOnSelect: true,
      },
    );

    channelPathAutocomplete.setValue(['@agent']);
    channelPathAutocomplete.focus();
  };

  /**
   * Attach event listeners to modal elements.
   */
  const attachEventListeners = () => {
    const $backdrop = $container.querySelector('.add-space-backdrop');
    const $close = $container.querySelector('.add-space-close');
    const $back = $container.querySelector('.add-space-back');
    const $cancel = $container.querySelector('.add-space-cancel');
    const $form = $container.querySelector('.add-space-form');
    const $iconOptions = $container.querySelectorAll('.icon-option');
    const $iconTabs = $container.querySelectorAll('.icon-tab');
    const $letterInput = /** @type {HTMLInputElement | null} */ (
      $container.querySelector('#letter-icon')
    );
    const $handleNameInput = /** @type {HTMLInputElement | null} */ (
      $container.querySelector('#handle-name')
    );
    const $agentNameInput = /** @type {HTMLInputElement | null} */ (
      $container.querySelector('#agent-name')
    );
    const $typeCards = $container.querySelectorAll('.space-type-card');

    // Close handlers
    if ($backdrop) {
      $backdrop.addEventListener('click', () => {
        hide();
        onClose();
      });
    }
    if ($close) {
      $close.addEventListener('click', () => {
        hide();
        onClose();
      });
    }
    if ($cancel) {
      $cancel.addEventListener('click', () => {
        hide();
        onClose();
      });
    }

    // Back button
    if ($back) {
      $back.addEventListener('click', () => {
        mode = 'choose';
        error = null;
        render();
      });
    }

    // Type card selection
    for (const $card of $typeCards) {
      $card.addEventListener('click', () => {
        const selectedMode = $card.getAttribute('data-mode');
        if (selectedMode === 'new-agent') {
          mode = 'new-agent';
          selectedIcon = getFirstUnusedIcon();
          useLetterIcon = false;
          error = null;
          render();
        } else if (selectedMode === 'existing') {
          mode = 'existing';
          selectedIcon = '🐈‍⬛';
          useLetterIcon = false;
          error = null;
          render();
        } else if (selectedMode === 'new-channel') {
          mode = 'new-channel';
          selectedIcon = '📡';
          useLetterIcon = false;
          channelPersonaMode = 'new';
          error = null;
          render();
        } else if (selectedMode === 'connect-channel') {
          mode = 'connect-channel';
          selectedIcon = getFirstUnusedIcon();
          useLetterIcon = false;
          connectPersonaMode = 'new';
          connectExistingSpaceId = null;
          error = null;
          render();
        } else if (selectedMode === 'whylip') {
          mode = 'whylip';
          selectedIcon = '📖';
          useLetterIcon = false;
          whylipName = '';
          whylipAgentName = '';
          error = null;
          render();
        } else if (selectedMode === 'graph') {
          mode = 'graph';
          selectedIcon = '🕸️';
          useLetterIcon = false;
          error = null;
          render();
        } else if (selectedMode === 'peers') {
          mode = 'peers';
          selectedIcon = '🌐';
          useLetterIcon = false;
          error = null;
          render();
        }
      });
    }

    // Handle name input - auto-populates agent name unless manually edited
    if ($handleNameInput) {
      $handleNameInput.addEventListener('input', () => {
        handleName = $handleNameInput.value;
        // Auto-update agent name if not manually edited
        if (!agentNameManuallyEdited && $agentNameInput) {
          $agentNameInput.value = getDefaultAgentName(handleName);
        }
      });
    }

    // Agent name input - track manual edits
    if ($agentNameInput) {
      $agentNameInput.addEventListener('input', () => {
        agentName = $agentNameInput.value;
        // Mark as manually edited if user changes it from the default
        const defaultName = getDefaultAgentName(handleName);
        if ($agentNameInput.value !== defaultName) {
          agentNameManuallyEdited = true;
        }
      });
    }

    // Icon selection
    for (const $option of $iconOptions) {
      $option.addEventListener('click', () => {
        const icon = $option.getAttribute('data-icon');
        if (icon) {
          selectedIcon = icon;
          useLetterIcon = false;
          // Just update icon selection, don't re-render whole modal
          updateIconSelection();
        }
      });
    }

    // Icon tabs
    for (const $tab of $iconTabs) {
      $tab.addEventListener('click', () => {
        const tab = $tab.getAttribute('data-tab');
        useLetterIcon = tab === 'letter';
        if (useLetterIcon && selectedIcon.length > 2) {
          selectedIcon = 'AB';
        }
        render();
      });
    }

    // Letter icon input
    if ($letterInput) {
      $letterInput.addEventListener('input', () => {
        selectedIcon = letterIcon($letterInput.value || 'AB');
        const $preview = $container.querySelector('.letter-icon-preview');
        if ($preview) {
          $preview.textContent = selectedIcon;
        }
      });
    }

    // Channel form inputs
    const $channelPetNameInput = /** @type {HTMLInputElement | null} */ (
      $container.querySelector('#channel-pet-name')
    );
    const $channelProposedNameInput = /** @type {HTMLInputElement | null} */ (
      $container.querySelector('#channel-proposed-name')
    );
    if ($channelPetNameInput) {
      $channelPetNameInput.addEventListener('input', () => {
        channelPetName = $channelPetNameInput.value;
      });
    }
    if ($channelProposedNameInput) {
      $channelProposedNameInput.addEventListener('input', () => {
        channelProposedName = $channelProposedNameInput.value;
      });
    }

    // View mode selector
    const $viewModeOptions = $container.querySelectorAll('.view-mode-option');
    for (const $option of $viewModeOptions) {
      $option.addEventListener('click', () => {
        const vm = $option.getAttribute('data-view-mode');
        if (vm === 'chat' || vm === 'forum' || vm === 'outliner') {
          channelViewMode = vm;
          // Update selection visually
          for (const $opt of $viewModeOptions) {
            $opt.classList.toggle(
              'selected',
              $opt.getAttribute('data-view-mode') === vm,
            );
          }
        }
      });
    }

    // Channel persona mode radios
    const $channelPersonaModeRadios = $container.querySelectorAll(
      'input[name="channel-persona-mode"]',
    );
    for (const $radio of $channelPersonaModeRadios) {
      $radio.addEventListener('change', () => {
        channelPersonaMode =
          /** @type {HTMLInputElement} */ ($radio).value === 'existing'
            ? 'existing'
            : 'new';
        render();
      });
    }

    // Whylip form inputs
    const $whylipNameInput = /** @type {HTMLInputElement | null} */ (
      $container.querySelector('#whylip-name')
    );
    const $whylipAgentNameInput = /** @type {HTMLInputElement | null} */ (
      $container.querySelector('#whylip-agent-name')
    );
    if ($whylipNameInput) {
      $whylipNameInput.addEventListener('input', () => {
        whylipName = $whylipNameInput.value;
      });
    }
    if ($whylipAgentNameInput) {
      $whylipAgentNameInput.addEventListener('input', () => {
        whylipAgentName = $whylipAgentNameInput.value;
      });
    }

    // Connect channel form inputs
    const $connectLocatorInput = /** @type {HTMLInputElement | null} */ (
      $container.querySelector('#connect-locator')
    );
    const $connectSpaceNameInput = /** @type {HTMLInputElement | null} */ (
      $container.querySelector('#connect-space-name')
    );
    const $connectProposedNameInput = /** @type {HTMLInputElement | null} */ (
      $container.querySelector('#connect-proposed-name')
    );
    const $personaModeRadios = $container.querySelectorAll(
      'input[name="connect-persona-mode"]',
    );
    const $existingPersonaRadios = $container.querySelectorAll(
      'input[name="connect-persona"]',
    );

    if ($connectLocatorInput) {
      $connectLocatorInput.addEventListener('input', () => {
        connectLocator = $connectLocatorInput.value;
      });
    }
    if ($connectSpaceNameInput) {
      $connectSpaceNameInput.addEventListener('input', () => {
        connectSpaceName = $connectSpaceNameInput.value;
      });
    }
    if ($connectProposedNameInput) {
      $connectProposedNameInput.addEventListener('input', () => {
        connectProposedName = $connectProposedNameInput.value;
      });
    }
    for (const $radio of $personaModeRadios) {
      $radio.addEventListener('change', () => {
        connectPersonaMode =
          /** @type {HTMLInputElement} */ ($radio).value === 'existing'
            ? 'existing'
            : 'new';
        render();
      });
    }
    for (const $radio of $existingPersonaRadios) {
      $radio.addEventListener('change', () => {
        connectExistingSpaceId = /** @type {HTMLInputElement} */ ($radio).value;
      });
    }

    // Form submission
    if ($form) {
      $form.addEventListener('submit', async e => {
        e.preventDefault();

        if (mode === 'new-agent') {
          await handleNewAgentSubmit();
        } else if (mode === 'existing') {
          await handleExistingSubmit();
        } else if (mode === 'new-channel') {
          await handleNewChannelSubmit();
        } else if (mode === 'connect-channel') {
          await handleConnectChannelSubmit();
        } else if (mode === 'whylip') {
          await handleWhylipSubmit();
        } else if (mode === 'graph') {
          await handleGraphSubmit();
        } else if (mode === 'peers') {
          await handlePeersSubmit();
        }
      });
    }

    // Escape key handler
    const handleEscape = (/** @type {KeyboardEvent} */ e) => {
      if (e.key === 'Escape' && visible) {
        // Don't close if autocomplete menu is visible
        if (pathAutocomplete && pathAutocomplete.isMenuVisible()) {
          return;
        }
        if (channelPathAutocomplete && channelPathAutocomplete.isMenuVisible()) {
          return;
        }
        // If in a sub-mode, go back to choose
        if (mode !== 'choose') {
          mode = 'choose';
          error = null;
          render();
          return;
        }
        hide();
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
  };

  /**
   * Handle new agent form submission.
   */
  const handleNewAgentSubmit = async () => {
    const name = handleName.trim();
    if (!name) {
      error = 'Please enter a handle name';
      render();
      return;
    }

    // Validate name (no spaces, dots, or special characters)
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name)) {
      error =
        'Handle must start with a letter and contain only letters, numbers, hyphens, and underscores';
      render();
      return;
    }

    // Determine the agent name to use
    const finalAgentName = agentNameManuallyEdited
      ? agentName.trim()
      : getDefaultAgentName(name);

    if (!finalAgentName) {
      error = 'Please enter an agent name';
      render();
      return;
    }

    isSubmitting = true;
    error = null;
    render();

    try {
      // Create the host: handle points to powers, agentName points to the agent
      await E(
        /** @type {{ provideHost: (name: string, opts: { agentName: string }) => Promise<void> }} */ (
          powers
        ),
      ).provideHost(name, { agentName: finalAgentName });

      // Create the space pointing to the agent (not the handle)
      await onSubmit({
        name,
        icon: selectedIcon,
        profilePath: [finalAgentName],
        layout: 'mailbox',
        scheme: schemePicker ? schemePicker.getValue() : 'auto',
      });

      hide({ restoreScheme: false });
      onClose();
    } catch (err) {
      console.error('[AddSpaceModal] Failed to create host:', err);
      let message;
      if (err instanceof Error) {
        message = err.message;
      } else if (typeof err === 'string') {
        message = err;
      } else {
        message = JSON.stringify(err);
      }
      error = `Failed to create host: ${message || 'Unknown error'}`;
      isSubmitting = false;
      render();
    }
  };

  /**
   * Handle new channel form submission.
   */
  const handleNewChannelSubmit = async () => {
    const spaceName = channelPetName.trim();
    if (!spaceName) {
      error = 'Please enter a space name';
      render();
      return;
    }

    if (!/^[a-z][a-z0-9-]*$/.test(spaceName)) {
      error =
        'Space name must be lowercase, start with a letter, and contain only letters, numbers, and hyphens';
      render();
      return;
    }

    const displayName = channelProposedName.trim();
    if (!displayName) {
      error = 'Please enter a display name';
      render();
      return;
    }

    if (channelPersonaMode === 'existing') {
      // Use an existing profile as the persona
      if (!channelPathAutocomplete) return;

      const paths = channelPathAutocomplete.getValue();
      if (paths.length === 0) {
        error = 'Please select a profile path';
        render();
        return;
      }

      const pathString = paths[0];
      const selectedPath = pathString.split('/').filter(Boolean);
      if (selectedPath.length === 0) {
        error = 'Please select a valid profile path';
        render();
        return;
      }

      isSubmitting = true;
      error = null;
      render();

      try {
        // Resolve the existing persona's powers by walking the path
        /** @type {unknown} */
        let personaPowers = powers;
        for (const segment of selectedPath) {
          personaPowers = await E(
            /** @type {{ lookup: (...args: string[]) => Promise<unknown> }} */ (
              personaPowers
            ),
          ).lookup(segment);
        }

        // Create channel inside persona's store
        await E(
          /** @type {{ makeChannel: (petName: string, proposedName: string) => Promise<unknown> }} */ (
            personaPowers
          ),
        ).makeChannel(spaceName, displayName);

        // Space config with profilePath pointing to existing persona
        await onSubmit({
          name: spaceName,
          icon: selectedIcon,
          profilePath: selectedPath,
          layout: 'channel',
          channelPetName: spaceName,
          proposedName: displayName,
          viewMode: channelViewMode,
          ownedPersona: false,
        });

        hide();
        onClose();
      } catch (err) {
        console.error('[AddSpaceModal] Failed to create channel:', err);
        let message;
        if (err instanceof Error) {
          message = err.message;
        } else if (typeof err === 'string') {
          message = err;
        } else {
          message = JSON.stringify(err);
        }
        error = `Failed to create channel: ${message || 'Unknown error'}`;
        isSubmitting = false;
        render();
      }
      return;
    }

    // New persona mode (current flow)
    isSubmitting = true;
    error = null;
    render();

    try {
      // 1. Create persona (host) — same pattern as New Profile
      const newAgentName = `persona-for-${spaceName}`;
      await E(
        /** @type {{ provideHost: (name: string, opts: { agentName: string }) => Promise<void> }} */ (
          powers
        ),
      ).provideHost(spaceName, { agentName: newAgentName });

      // 2. Get the persona's powers
      const personaPowers = await E(
        /** @type {{ lookup: (...args: string[]) => Promise<unknown> }} */ (
          powers
        ),
      ).lookup(newAgentName);

      // 3. Create channel inside persona's store
      await E(
        /** @type {{ makeChannel: (petName: string, proposedName: string) => Promise<unknown> }} */ (
          personaPowers
        ),
      ).makeChannel(spaceName, displayName);

      // 4. Space config with profilePath pointing to persona
      await onSubmit({
        name: spaceName,
        icon: selectedIcon,
        profilePath: [newAgentName],
        layout: 'channel',
        channelPetName: spaceName,
        proposedName: displayName,
        viewMode: channelViewMode,
        ownedPersona: true,
      });

      hide();
      onClose();
    } catch (err) {
      console.error('[AddSpaceModal] Failed to create channel:', err);
      let message;
      if (err instanceof Error) {
        message = err.message;
      } else if (typeof err === 'string') {
        message = err;
      } else {
        message = JSON.stringify(err);
      }
      error = `Failed to create channel: ${message || 'Unknown error'}`;
      isSubmitting = false;
      render();
    }
  };

  /**
   * Parse an endo locator URL into a formula identifier string.
   * @param {string} locator - e.g., "endo://node/?id=num&type=channel"
   * @returns {string} formula identifier, e.g., "num:node"
   */
  const formulaIdFromLocator = locator => {
    const url = new URL(locator);
    const node = url.host;
    const number = url.searchParams.get('id');
    if (!node || !number) {
      throw new Error('Invalid locator: missing node or id');
    }
    return `${number}:${node}`;
  };

  /**
   * Handle connect to channel form submission.
   */
  const handleConnectChannelSubmit = async () => {
    const locator = connectLocator.trim();
    if (!locator) {
      error = 'Please paste an invitation locator';
      render();
      return;
    }

    if (!locator.startsWith('endo://')) {
      error = 'Locator must start with endo://';
      render();
      return;
    }

    /** @type {string} */
    let formulaId;
    try {
      formulaId = formulaIdFromLocator(locator);
    } catch {
      error = 'Invalid locator URL format';
      render();
      return;
    }

    if (connectPersonaMode === 'new') {
      const spaceName = connectSpaceName.trim();
      if (!spaceName) {
        error = 'Please enter a space name';
        render();
        return;
      }
      if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(spaceName)) {
        error =
          'Space name must start with a letter and contain only letters, numbers, hyphens, and underscores';
        render();
        return;
      }
      const displayName = connectProposedName.trim();
      if (!displayName) {
        error = 'Please enter a display name';
        render();
        return;
      }

      isSubmitting = true;
      error = null;
      render();

      try {
        // 0. Register peer info from the locator's connection hints
        //    so the daemon knows how to reach the remote node.
        const locatorUrl = new URL(locator);
        const nodeNumber = locatorUrl.host;
        const addresses = locatorUrl.searchParams.getAll('at');
        if (addresses.length > 0 && nodeNumber) {
          await E(
            /** @type {{ addPeerInfo: (info: { node: string, addresses: string[] }) => Promise<void> }} */ (
              powers
            ),
          ).addPeerInfo({ node: nodeNumber, addresses });
        }

        // 1. Create persona (host)
        const agentName = `persona-for-${spaceName}`;
        await E(
          /** @type {{ provideHost: (name: string, opts: { agentName: string }) => Promise<void> }} */ (
            powers
          ),
        ).provideHost(spaceName, { agentName });

        // 2. Get persona's powers
        const personaPowers = await E(
          /** @type {{ lookup: (...args: string[]) => Promise<unknown> }} */ (
            powers
          ),
        ).lookup(agentName);

        // 3. Write the channel formula ID into the persona's pet store
        await E(
          /** @type {{ write: (name: string | string[], id: string) => Promise<void> }} */ (
            personaPowers
          ),
        ).write('general', formulaId);

        // 4. Create space config
        await onSubmit({
          name: spaceName,
          icon: selectedIcon,
          profilePath: [agentName],
          layout: 'channel',
          channelPetName: 'general',
          proposedName: displayName,
        });

        hide();
        onClose();
      } catch (err) {
        console.error('[AddSpaceModal] Failed to connect to channel:', err);
        const message =
          err instanceof Error ? err.message : JSON.stringify(err);
        error = `Failed to connect: ${message || 'Unknown error'}`;
        isSubmitting = false;
        render();
      }
    } else {
      // Existing persona mode
      if (!connectExistingSpaceId) {
        error = 'Please select an existing persona';
        render();
        return;
      }

      isSubmitting = true;
      error = null;
      render();

      try {
        // Register peer info from the locator's connection hints
        const locatorUrl = new URL(locator);
        const nodeNumber = locatorUrl.host;
        const addresses = locatorUrl.searchParams.getAll('at');
        if (addresses.length > 0 && nodeNumber) {
          await E(
            /** @type {{ addPeerInfo: (info: { node: string, addresses: string[] }) => Promise<void> }} */ (
              powers
            ),
          ).addPeerInfo({ node: nodeNumber, addresses });
        }

        const existingSpaces = getExistingChannelSpaces
          ? getExistingChannelSpaces()
          : [];
        const space = existingSpaces.find(s => s.id === connectExistingSpaceId);
        if (!space) {
          throw new Error('Selected space not found');
        }

        // Resolve the existing persona's powers
        /** @type {unknown} */
        let personaPowers = powers;
        for (const segment of space.profilePath) {
          personaPowers = await E(
            /** @type {{ lookup: (...args: string[]) => Promise<unknown> }} */ (
              personaPowers
            ),
          ).lookup(segment);
        }

        // Write the channel formula ID into the persona's pet store
        await E(
          /** @type {{ write: (name: string | string[], id: string) => Promise<void> }} */ (
            personaPowers
          ),
        ).write('general', formulaId);

        // No new space needed — the existing space already renders the channel
        hide();
        onClose();
      } catch (err) {
        console.error('[AddSpaceModal] Failed to connect to channel:', err);
        const message =
          err instanceof Error ? err.message : JSON.stringify(err);
        error = `Failed to connect: ${message || 'Unknown error'}`;
        isSubmitting = false;
        render();
      }
    }
  };

  /**
   * Handle Whylip Book form submission.
   * Looks up the fae-factory by petname, calls createAgent with the
   * whylip system prompt, then creates a host profile with the fae
   * agent reference written into its pet store.
   */
  const handleWhylipSubmit = async () => {
    const name = whylipName.trim();
    if (!name) {
      error = 'Please enter a book name';
      render();
      return;
    }
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name)) {
      error =
        'Name must start with a letter and contain only letters, numbers, hyphens, and underscores';
      render();
      return;
    }

    const factoryPetName = whylipAgentName.trim();
    if (!factoryPetName) {
      error = 'Please enter the pet name of a Fae factory';
      render();
      return;
    }

    isSubmitting = true;
    error = null;
    render();

    try {
      const faeAgentName = `${name}-agent`;
      const finalAgentName = `whylip-${name}`;

      // Look up the fae-factory and create an agent with the whylip prompt.
      const faeFactory = await E(
        /** @type {{ lookup: (...args: string[]) => Promise<unknown> }} */ (
          powers
        ),
      ).lookup(factoryPetName);

      const agentProfileName = /** @type {string} */ (
        await E(
          /** @type {{ createAgent: (name: string, opts: object) => Promise<string> }} */ (
            faeFactory
          ),
        ).createAgent(
          faeAgentName,
          harden({ systemPrompt: WHYLIP_SYSTEM_PROMPT }),
        )
      );

      // Get the formula ID for the agent profile so we can write it
      // into the whylip host's pet store.
      const agentFormulaId = /** @type {string} */ (
        await E(
          /** @type {{ identify: (petName: string) => Promise<string> }} */ (
            powers
          ),
        ).identify(agentProfileName)
      );

      // Create the whylip host profile.
      await E(
        /** @type {{ provideHost: (name: string, opts: { agentName: string }) => Promise<void> }} */ (
          powers
        ),
      ).provideHost(name, { agentName: finalAgentName });

      // Write the fae agent reference into the whylip host's pet store
      // under the well-known name "fae".
      const whylipPowers = await E(
        /** @type {{ lookup: (...args: string[]) => Promise<unknown> }} */ (
          powers
        ),
      ).lookup(finalAgentName);

      await E(
        /** @type {{ write: (name: string | string[], id: string) => Promise<void> }} */ (
          whylipPowers
        ),
      ).write('fae', agentFormulaId);

      await onSubmit({
        name,
        icon: selectedIcon,
        profilePath: [finalAgentName],
        layout: 'whylip',
        scheme: schemePicker ? schemePicker.getValue() : 'auto',
      });

      hide({ restoreScheme: false });
      onClose();
    } catch (err) {
      console.error('[AddSpaceModal] Failed to create Whylip book:', err);
      let message;
      if (err instanceof Error) {
        message = err.message;
      } else if (typeof err === 'string') {
        message = err;
      } else {
        message = JSON.stringify(err);
      }
      error = `Failed to create book: ${message || 'Unknown error'}`;
      isSubmitting = false;
      render();
    }
  };

  /**
   * Handle inventory graph form submission.
   */
  const handleGraphSubmit = async () => {
    if (!pathAutocomplete) return;

    const paths = pathAutocomplete.getValue();
    if (paths.length === 0) {
      error = 'Please select a profile path';
      render();
      return;
    }

    const pathString = paths[0];
    const profilePath = pathString.split('/').filter(Boolean);

    if (profilePath.length === 0) {
      error = 'Please select a valid profile path';
      render();
      return;
    }

    const name = `${profilePath[profilePath.length - 1]}-graph`;

    isSubmitting = true;
    error = null;
    render();

    try {
      await onSubmit({
        name,
        icon: selectedIcon,
        profilePath,
        layout: 'graph',
        scheme: schemePicker ? schemePicker.getValue() : 'auto',
      });
      hide({ restoreScheme: false });
      onClose();
    } catch (err) {
      error = `Failed to create graph space: ${/** @type {Error} */ (err).message}`;
      isSubmitting = false;
      render();
    }
  };

  /**
   * Handle peers form submission.
   */
  const handlePeersSubmit = async () => {
    isSubmitting = true;
    error = null;
    render();

    try {
      await onSubmit({
        name: 'peers',
        icon: selectedIcon,
        profilePath: [],
        layout: 'peers',
        scheme: schemePicker ? schemePicker.getValue() : 'auto',
      });
      hide({ restoreScheme: false });
      onClose();
    } catch (err) {
      error = `Failed to create peers space: ${/** @type {Error} */ (err).message}`;
      isSubmitting = false;
      render();
    }
  };

  /**
   * Handle existing profile form submission.
   */
  const handleExistingSubmit = async () => {
    if (!pathAutocomplete) return;

    const paths = pathAutocomplete.getValue();
    if (paths.length === 0) {
      error = 'Please select a profile path';
      render();
      return;
    }

    // Use the first path
    const pathString = paths[0];
    const profilePath = pathString.split('/').filter(Boolean);

    if (profilePath.length === 0) {
      error = 'Please select a valid profile path';
      render();
      return;
    }

    // Derive name from the last segment of the profile path
    const name = profilePath[profilePath.length - 1];

    isSubmitting = true;
    error = null;
    render();

    try {
      await onSubmit({
        name,
        icon: selectedIcon,
        profilePath,
        layout: 'mailbox',
        scheme: schemePicker ? schemePicker.getValue() : 'auto',
      });
      hide({ restoreScheme: false });
      onClose();
    } catch (err) {
      error = `Failed to add space: ${/** @type {Error} */ (err).message}`;
      isSubmitting = false;
      render();
    }
  };

  /**
   * Update icon selection without re-rendering.
   */
  const updateIconSelection = () => {
    const $options = $container.querySelectorAll('.icon-option');
    for (const $option of $options) {
      const icon = $option.getAttribute('data-icon');
      if (icon === selectedIcon) {
        $option.classList.add('selected');
      } else {
        $option.classList.remove('selected');
      }
    }
  };

  /**
   * Show the modal.
   */
  const show = () => {
    visible = true;
    mode = 'choose';
    selectedIcon = '🐈‍⬛';
    useLetterIcon = false;
    handleName = '';
    agentName = '';
    agentNameManuallyEdited = false;
    channelPetName = '';
    channelProposedName = '';
    channelPersonaMode = 'new';
    connectLocator = '';
    connectSpaceName = '';
    connectProposedName = '';
    connectPersonaMode = 'new';
    connectExistingSpaceId = null;
    whylipName = '';
    whylipAgentName = '';
    error = null;
    isSubmitting = false;
    schemePicker = null;

    render();
    $container.style.display = 'flex';
  };

  /**
   * Hide the modal, optionally restoring the previous color scheme.
   *
   * @param {object} [options]
   * @param {boolean} [options.restoreScheme] - Whether to restore the
   *   color scheme that was active before the picker was opened.
   */
  const hide = ({ restoreScheme = true } = {}) => {
    visible = false;
    $container.style.display = 'none';
    if (restoreScheme && schemePicker) {
      schemePicker.restoreScheme();
    }
    if (pathAutocomplete) {
      pathAutocomplete.dispose();
      pathAutocomplete = null;
    }
    if (channelPathAutocomplete) {
      channelPathAutocomplete.dispose();
      channelPathAutocomplete = null;
    }
  };

  /**
   * Check if modal is visible.
   *
   * @returns {boolean}
   */
  const isVisible = () => visible;

  // Initial state
  $container.innerHTML = '';
  $container.style.display = 'none';

  return harden({ show, hide, isVisible });
};
harden(createAddSpaceModal);
