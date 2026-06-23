// @ts-check
/* eslint-disable no-use-before-define */
/* eslint-disable no-await-in-loop */

import harden from '@endo/harden';

/** @import { ColorScheme } from './spaces-gutter.js' */
/** @import { PetNamePathsAutocompleteAPI } from './petname-paths-autocomplete.js' */
/** @import { ERef } from '@endo/far' */
/** @import { EndoHost } from '@endo/daemon' */

import { E } from '@endo/far';
import { ALL_ICONS, IconSelector } from './icon-selector.js';
import { assertValidLocator } from './locator.js';
import { petNamePathsAutocomplete } from './petname-paths-autocomplete.js';
import { createSchemePicker } from './scheme-picker.js';
import { Fragment, h, renderConfined } from './setup-preact-container.js';

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
 * @property {'mailbox' | 'channel' | 'whylip' | 'graph' | 'peers' | 'files' | 'floot'} layout - Layout type
 * @property {ColorScheme} [scheme] - Color scheme preference
 * @property {string} [channelPetName] - Pet name for the channel object (channel mode)
 * @property {string} [proposedName] - Display name for the channel creator
 * @property {string} [whylipSystemPrompt] - System prompt override for Whylip mode
 * @property {'chat' | 'forum' | 'outliner' | 'microblog'} [viewMode] - Channel view mode (default: 'chat')
 * @property {boolean} [ownedPersona] - Whether the space owns the persona (for cleanup)
 * @property {string[]} [audioPath] - Pet name path to a speech-to-text object (floot mic)
 * @property {string[]} [ttsPath] - Pet name path to a text-to-speech object (floot spoken replies)
 */

// ── Confined Preact view ──────────────────────────────────────────────────
//
// The modal chrome and every form is a confined Preact tree rendered through
// the sanitizing `renderConfined`, replacing the imperative innerHTML +
// attachEventListeners path. This closes the unescaped-interpolation injection
// surface the old `value="${userTyped}"` string templates had: Preact escapes
// text and attribute values, so a malicious handle/name/locator can never break
// out into markup.
//
// All wizard state and the daemon-side submit handlers stay host-side in
// `createAddSpaceModal`; the view is driven by a pure-data `view` snapshot plus
// an `on` callback bag. `renderConfined` is synchronous, so the host still
// mounts the scheme picker and the pet-name autocompletes into the slot/anchor
// elements the view renders (queried straight after each render), exactly as
// before.

/**
 * @typedef {object} AddSpaceView
 * @property {string} mode
 * @property {string} nextIcon - first unused icon (the New Profile card preview)
 * @property {string} selectedIcon
 * @property {boolean} useLetterIcon
 * @property {string} handleName
 * @property {string} displayAgentName
 * @property {string} channelPetName
 * @property {string} channelProposedName
 * @property {'chat' | 'forum' | 'outliner' | 'microblog'} channelViewMode
 * @property {'new' | 'existing'} channelPersonaMode
 * @property {string} channelIntroducedNames
 * @property {string} connectLocator
 * @property {string} connectSpaceName
 * @property {string} connectProposedName
 * @property {'new' | 'existing'} connectPersonaMode
 * @property {string | null} connectExistingSpaceId
 * @property {Array<{ id: string, name: string, icon: string, profilePath: string[] }>} existingChannelSpaces
 * @property {string} whylipName
 * @property {string} whylipAgentName
 * @property {string} flootAudioPath
 * @property {string} flootTtsPath
 * @property {string | null} error
 * @property {boolean} isSubmitting
 */

/**
 * The space-type cards shown on the first screen. `data-mode` is preserved
 * because the e2e suite selects cards by it.
 *
 * @type {Array<{ mode: string, icon: string, title: string, desc: string }>}
 */
const SPACE_TYPE_CARDS = harden([
  {
    mode: 'new-agent',
    icon: '',
    title: 'New Profile',
    desc: 'Create a fresh profile',
  },
  {
    mode: 'existing',
    icon: '🐈‍⬛',
    title: 'Existing Profile',
    desc: 'Connect to an existing profile',
  },
  {
    mode: 'new-channel',
    icon: '📡',
    title: 'New Channel',
    desc: 'Create a multi-party chat room',
  },
  {
    mode: 'connect-channel',
    icon: '🔗',
    title: 'Connect to Channel',
    desc: 'Join a channel via invitation link',
  },
  {
    mode: 'whylip',
    icon: '📖',
    title: 'Whylip Book',
    desc: 'An interactive illustrated primer powered by a Fae agent',
  },
  {
    mode: 'graph',
    icon: '🕸️',
    title: 'Inventory Graph',
    desc: 'Visualize your pet store as a force-directed graph',
  },
  {
    mode: 'peers',
    icon: '🌐',
    title: 'Known Peers',
    desc: 'List all known remote Endo peers and connection hints',
  },
  {
    mode: 'files',
    icon: '📂',
    title: 'File Explorer',
    desc: 'Browse and edit endo-fs filesystem objects, mounts, and layers',
  },
  {
    mode: 'floot',
    icon: '💬',
    title: 'Floot Chat',
    desc: 'Chat with a Floot streaming agent and watch its reply arrive token by token',
  },
]);

/** @type {Array<{ mode: 'chat' | 'forum' | 'outliner' | 'microblog', label: string, desc: string }>} */
const CHANNEL_VIEW_MODES = harden([
  {
    mode: 'chat',
    label: 'Traditional Chat',
    desc: 'Chronological messages with thread drill-downs',
  },
  {
    mode: 'forum',
    label: 'Forum',
    desc: 'Threaded tree view with active subtrees at bottom',
  },
  {
    mode: 'outliner',
    label: 'Outliner',
    desc: 'Collaborative document with edit history',
  },
  {
    mode: 'microblog',
    label: 'Microblog',
    desc: 'Reverse-chronological feed with profile header',
  },
]);

/**
 * The modal header: optional back arrow, title, close button.
 *
 * @param {object} props
 * @param {string} props.title
 * @param {(() => void)} [props.onBack]
 * @param {() => void} props.onClose
 */
const ModalHeader = ({ title, onBack, onClose }) =>
  h(
    'div',
    { class: 'add-space-header' },
    onBack
      ? h(
          'button',
          {
            type: 'button',
            class: 'add-space-back',
            title: 'Back',
            onClick: onBack,
          },
          '←',
        )
      : null,
    h('h2', { class: 'add-space-title' }, title),
    h(
      'button',
      {
        type: 'button',
        class: 'add-space-close',
        title: 'Close (Esc)',
        onClick: onClose,
      },
      '×',
    ),
  );
harden(ModalHeader);

/**
 * The reusable icon-selector field wrapper (label + grid/letter input).
 *
 * @param {object} props
 * @param {AddSpaceView} props.view
 * @param {AddSpaceHandlers} props.on
 */
const IconField = ({ view, on }) =>
  h(
    'div',
    { class: 'add-space-field' },
    h(IconSelector, {
      selectedIcon: view.selectedIcon,
      useLetterIcon: view.useLetterIcon,
      onSelectIcon: on.selectIcon,
      onToggleLetterIcon: on.toggleLetterIcon,
    }),
  );
harden(IconField);

/** Empty `#scheme-picker-slot` anchor; the host mounts the picker into it. */
const SchemeSlot = () =>
  h('div', { id: 'scheme-picker-slot', class: 'add-space-field' });
harden(SchemeSlot);

/**
 * @param {object} props
 * @param {string | null} props.error
 */
const ErrorBlock = ({ error }) =>
  error ? h('div', { class: 'add-space-error' }, error) : null;
harden(ErrorBlock);

/**
 * The Cancel / Submit action row.
 *
 * @param {object} props
 * @param {boolean} props.isSubmitting
 * @param {string} props.label - submit label when idle
 * @param {string} props.busyLabel - submit label while submitting
 * @param {() => void} props.onCancel
 */
const Actions = ({ isSubmitting, label, busyLabel, onCancel }) =>
  h(
    'div',
    { class: 'add-space-actions' },
    h(
      'button',
      { type: 'button', class: 'add-space-cancel', onClick: onCancel },
      'Cancel',
    ),
    h(
      'button',
      {
        type: 'submit',
        class: 'add-space-submit',
        disabled: isSubmitting || undefined,
      },
      isSubmitting ? busyLabel : label,
    ),
  );
harden(Actions);

/**
 * A standard labelled text input field.
 *
 * @param {object} props
 * @param {string} props.id
 * @param {string} props.label
 * @param {string} props.placeholder
 * @param {string} props.value
 * @param {(value: string) => void} props.onInput
 * @param {import('preact').ComponentChildren} [props.hint]
 * @param {string} [props.pattern]
 */
const TextField = ({ id, label, placeholder, value, onInput, hint, pattern }) =>
  h(
    'div',
    { class: 'add-space-field' },
    h('label', { for: id }, label),
    h('input', {
      type: 'text',
      id,
      placeholder,
      value,
      autocomplete: 'off',
      ...(pattern ? { pattern } : {}),
      /** @param {{ target: { value: string } }} e */
      onInput: e => onInput(e.target.value),
    }),
    hint ? h('div', { class: 'field-hint' }, hint) : null,
  );
harden(TextField);

/** The single fixed "Mailbox" layout selector (decorative; one option). */
const MailboxLayoutField = () =>
  h(
    'div',
    { class: 'add-space-field' },
    h('label', null, 'Layout'),
    h(
      'div',
      { class: 'layout-selector' },
      h(
        'button',
        {
          type: 'button',
          class: 'layout-option selected',
          'data-layout': 'mailbox',
        },
        h('span', { class: 'layout-icon' }, '📬'),
        h('span', { class: 'layout-name' }, 'Mailbox'),
      ),
    ),
    h('div', { class: 'field-hint' }, 'More layouts coming soon'),
  );
harden(MailboxLayoutField);

/**
 * The space-type chooser (first screen).
 *
 * @param {object} props
 * @param {AddSpaceView} props.view
 * @param {AddSpaceHandlers} props.on
 */
const ChooseMode = ({ view, on }) =>
  h(
    Fragment,
    null,
    h('div', { class: 'add-space-backdrop', onClick: on.close }),
    h(
      'div',
      { class: 'add-space-modal' },
      h(ModalHeader, { title: 'Add Space', onClose: on.close }),
      h(
        'div',
        { class: 'add-space-choose' },
        SPACE_TYPE_CARDS.map(card =>
          h(
            'button',
            {
              key: card.mode,
              type: 'button',
              class: 'space-type-card',
              'data-mode': card.mode,
              onClick: () => on.selectMode(card.mode),
            },
            h(
              'span',
              { class: 'space-type-icon' },
              card.mode === 'new-agent' ? view.nextIcon : card.icon,
            ),
            h('span', { class: 'space-type-title' }, card.title),
            h('span', { class: 'space-type-desc' }, card.desc),
          ),
        ),
      ),
    ),
  );
harden(ChooseMode);

/**
 * Wrap a form body in the standard backdrop + modal + form shell.
 *
 * @param {object} props
 * @param {string} props.title
 * @param {AddSpaceHandlers} props.on
 * @param {import('preact').ComponentChildren} [props.children]
 */
const FormShell = ({ title, on, children }) =>
  h(
    Fragment,
    null,
    h('div', { class: 'add-space-backdrop', onClick: on.close }),
    h(
      'div',
      { class: 'add-space-modal' },
      h(ModalHeader, { title, onBack: on.back, onClose: on.close }),
      h(
        'form',
        {
          class: 'add-space-form',
          /** @param {{ preventDefault: () => void }} e */
          onSubmit: e => {
            e.preventDefault();
            on.submit();
          },
        },
        children,
      ),
    ),
  );
harden(FormShell);

/**
 * @param {object} props
 * @param {AddSpaceView} props.view
 * @param {AddSpaceHandlers} props.on
 */
const NewAgentForm = ({ view, on }) =>
  h(
    FormShell,
    { title: 'New Profile', on },
    h(TextField, {
      id: 'handle-name',
      label: 'Handle',
      placeholder: 'e.g., clark, bruce, diana',
      value: view.handleName,
      onInput: on.handleInput,
      hint: "The pet name for accessing this profile's powers",
    }),
    h(TextField, {
      id: 'agent-name',
      label: 'Agent Name',
      placeholder: 'profile-for-handle',
      value: view.displayAgentName,
      onInput: on.agentInput,
      hint: 'Internal identifier for the agent',
    }),
    h(IconField, { view, on }),
    h(MailboxLayoutField, null),
    h(SchemeSlot, null),
    h(ErrorBlock, { error: view.error }),
    h(Actions, {
      isSubmitting: view.isSubmitting,
      label: 'Create Space',
      busyLabel: 'Creating...',
      onCancel: on.close,
    }),
  );
harden(NewAgentForm);

/**
 * The pet-name path autocomplete anchor (host mounts the control here).
 *
 * @param {object} props
 * @param {string} props.label
 * @param {string} props.inputId
 * @param {string} props.menuId
 * @param {import('preact').ComponentChildren} [props.hint]
 */
const PathSelectorField = ({ label, inputId, menuId, hint }) =>
  h(
    'div',
    { class: 'add-space-field' },
    h('label', null, label),
    h(
      'div',
      { class: 'petname-path-selector' },
      h('div', { id: inputId, class: 'profile-path-input-container' }),
      h('div', { id: menuId, class: 'token-menu' }),
    ),
    hint ? h('div', { class: 'field-hint' }, hint) : null,
  );
harden(PathSelectorField);

/** @param {{ view: AddSpaceView, on: AddSpaceHandlers }} props */
const ExistingForm = ({ view, on }) =>
  h(
    FormShell,
    { title: 'Existing Profile', on },
    h(IconField, { view, on }),
    h(PathSelectorField, {
      label: 'Profile Path',
      inputId: 'profile-path-input',
      menuId: 'profile-path-menu',
      hint: h(DrillHint, null),
    }),
    h(MailboxLayoutField, null),
    h(SchemeSlot, null),
    h(ErrorBlock, { error: view.error }),
    h(Actions, {
      isSubmitting: view.isSubmitting,
      label: 'Add Space',
      busyLabel: 'Adding...',
      onCancel: on.close,
    }),
  );
harden(ExistingForm);

/** The drill-down hint shared by the path selectors. */
const DrillHint = () =>
  h(
    Fragment,
    null,
    'Use ',
    h('kbd', null, '.'),
    ' to drill down, ',
    h('kbd', null, 'Enter'),
    ' to add space',
  );
harden(DrillHint);

/** @param {{ view: AddSpaceView, on: AddSpaceHandlers }} props */
const NewChannelForm = ({ view, on }) =>
  h(
    FormShell,
    { title: 'New Channel', on },
    h(
      'div',
      { class: 'add-space-field' },
      h('label', null, 'Persona'),
      h(
        'div',
        { class: 'connect-persona-choices' },
        h(
          'label',
          { class: 'connect-persona-option' },
          h('input', {
            type: 'radio',
            name: 'channel-persona-mode',
            value: 'new',
            checked: view.channelPersonaMode === 'new',
            onChange: () => on.channelPersonaMode('new'),
          }),
          h('span', null, 'Create new persona'),
        ),
        h(
          'label',
          { class: 'connect-persona-option' },
          h('input', {
            type: 'radio',
            name: 'channel-persona-mode',
            value: 'existing',
            checked: view.channelPersonaMode === 'existing',
            onChange: () => on.channelPersonaMode('existing'),
          }),
          h('span', null, 'Use existing profile'),
        ),
      ),
    ),
    view.channelPersonaMode === 'existing'
      ? h(
          'div',
          { class: 'add-space-field' },
          h('label', null, 'Profile Path'),
          h(
            'div',
            { class: 'petname-path-selector' },
            h('div', {
              id: 'channel-profile-path-input',
              class: 'profile-path-input-container',
            }),
            h('div', { id: 'channel-profile-path-menu', class: 'token-menu' }),
          ),
          h(
            'div',
            { class: 'field-hint' },
            'Use ',
            h('kbd', null, '.'),
            ' to drill down, ',
            h('kbd', null, 'Enter'),
            ' to select',
          ),
        )
      : null,
    h(IconField, { view, on }),
    h(TextField, {
      id: 'channel-pet-name',
      label: 'Space Name',
      placeholder: 'e.g., general, dev-chat',
      value: view.channelPetName,
      onInput: on.channelPetNameInput,
      hint: 'Lowercase letters, numbers, and hyphens only (e.g., my-team)',
      pattern: '[a-z][a-z0-9-]*',
    }),
    h(TextField, {
      id: 'channel-proposed-name',
      label: 'Your Display Name',
      placeholder: 'e.g., Alice, Admin',
      value: view.channelProposedName,
      onInput: on.channelProposedNameInput,
      hint: 'How others will see you in this channel',
    }),
    h(
      'div',
      { class: 'add-space-field' },
      h('label', null, 'Channel View'),
      h(
        'div',
        { class: 'view-mode-selector' },
        CHANNEL_VIEW_MODES.map(vm =>
          h(
            'button',
            {
              key: vm.mode,
              type: 'button',
              class: `view-mode-option ${
                view.channelViewMode === vm.mode ? 'selected' : ''
              }`,
              'data-view-mode': vm.mode,
              onClick: () => on.channelViewMode(vm.mode),
            },
            h('span', { class: 'view-mode-label' }, vm.label),
            h('span', { class: 'view-mode-desc' }, vm.desc),
          ),
        ),
      ),
    ),
    view.channelPersonaMode === 'new'
      ? h(TextField, {
          id: 'channel-introduced-names',
          label: 'Share from Inventory',
          placeholder: 'e.g., my-tool, my-data',
          value: view.channelIntroducedNames,
          onInput: on.channelIntroducedNamesInput,
          hint: "Comma-separated pet names to copy into this persona's namespace",
        })
      : null,
    h(ErrorBlock, { error: view.error }),
    h(Actions, {
      isSubmitting: view.isSubmitting,
      label: 'Create Channel',
      busyLabel: 'Creating...',
      onCancel: on.close,
    }),
  );
harden(NewChannelForm);

/** @param {{ view: AddSpaceView, on: AddSpaceHandlers }} props */
const ConnectChannelForm = ({ view, on }) =>
  h(
    FormShell,
    { title: 'Connect to Channel', on },
    h(TextField, {
      id: 'connect-locator',
      label: 'Invitation Locator',
      placeholder: 'endo://…',
      value: view.connectLocator,
      onInput: on.connectLocatorInput,
      hint: 'Paste the invitation link you received',
    }),
    h(
      'div',
      { class: 'add-space-field' },
      h('label', null, 'Persona'),
      h(
        'div',
        { class: 'connect-persona-choices' },
        h(
          'label',
          { class: 'connect-persona-option' },
          h('input', {
            type: 'radio',
            name: 'connect-persona-mode',
            value: 'new',
            checked: view.connectPersonaMode === 'new',
            onChange: () => on.connectPersonaMode('new'),
          }),
          h('span', null, 'Create new persona'),
        ),
        view.existingChannelSpaces.length > 0
          ? h(
              'label',
              { class: 'connect-persona-option' },
              h('input', {
                type: 'radio',
                name: 'connect-persona-mode',
                value: 'existing',
                checked: view.connectPersonaMode === 'existing',
                onChange: () => on.connectPersonaMode('existing'),
              }),
              h('span', null, 'Use existing persona'),
            )
          : null,
      ),
    ),
    view.connectPersonaMode === 'new'
      ? h(
          Fragment,
          null,
          h(IconField, { view, on }),
          h(TextField, {
            id: 'connect-space-name',
            label: 'Space Name',
            placeholder: 'e.g., team-chat',
            value: view.connectSpaceName,
            onInput: on.connectSpaceNameInput,
            hint: 'Lowercase letters, numbers, and hyphens only (e.g., my-team)',
            pattern: '[a-z][a-z0-9-]*',
          }),
          h(TextField, {
            id: 'connect-proposed-name',
            label: 'Your Display Name',
            placeholder: 'e.g., Alice',
            value: view.connectProposedName,
            onInput: on.connectProposedNameInput,
            hint: 'How others will see you in this channel',
          }),
        )
      : h(
          'div',
          { class: 'add-space-field' },
          h('label', null, 'Choose a persona'),
          h(
            'div',
            { class: 'connect-existing-list' },
            view.existingChannelSpaces.length > 0
              ? view.existingChannelSpaces.map(s =>
                  h(
                    'label',
                    { key: s.id, class: 'connect-persona-option' },
                    h('input', {
                      type: 'radio',
                      name: 'connect-persona',
                      value: s.id,
                      checked: view.connectExistingSpaceId === s.id,
                      onChange: () => on.connectExistingSpace(s.id),
                    }),
                    h('span', { class: 'connect-persona-icon' }, s.icon),
                    h('span', { class: 'connect-persona-name' }, s.name),
                  ),
                )
              : h(
                  'div',
                  { class: 'field-hint' },
                  'No existing channel spaces found',
                ),
          ),
        ),
    h(ErrorBlock, { error: view.error }),
    h(Actions, {
      isSubmitting: view.isSubmitting,
      label: 'Connect',
      busyLabel: 'Connecting...',
      onCancel: on.close,
    }),
  );
harden(ConnectChannelForm);

/** @param {{ view: AddSpaceView, on: AddSpaceHandlers }} props */
const WhylipForm = ({ view, on }) =>
  h(
    FormShell,
    { title: 'Whylip Book', on },
    h(TextField, {
      id: 'whylip-name',
      label: 'Book Name',
      placeholder: 'e.g., physics-primer',
      value: view.whylipName,
      onInput: on.whylipNameInput,
      hint: 'A short name for this primer (letters, numbers, hyphens)',
      pattern: '[a-zA-Z][a-zA-Z0-9_-]*',
    }),
    h(
      'div',
      { class: 'add-space-field' },
      h('label', { for: 'whylip-agent-name' }, 'Fae Factory'),
      h('input', {
        type: 'text',
        id: 'whylip-agent-name',
        placeholder: 'e.g., fae-factory',
        value: view.whylipAgentName,
        autocomplete: 'off',
        /** @param {{ target: { value: string } }} e */
        onInput: e => on.whylipAgentNameInput(e.target.value),
      }),
      h(
        'div',
        { class: 'field-hint' },
        'Pet name of the Fae factory controller (from ',
        h('code', null, 'endo list'),
        ')',
      ),
    ),
    h(IconField, { view, on }),
    h(SchemeSlot, null),
    h(ErrorBlock, { error: view.error }),
    h(Actions, {
      isSubmitting: view.isSubmitting,
      label: 'Create Book',
      busyLabel: 'Creating...',
      onCancel: on.close,
    }),
  );
harden(WhylipForm);

/** @param {{ view: AddSpaceView, on: AddSpaceHandlers }} props */
const GraphForm = ({ view, on }) =>
  h(
    FormShell,
    { title: 'Inventory Graph', on },
    h(IconField, { view, on }),
    h(PathSelectorField, {
      label: 'Profile Path',
      inputId: 'profile-path-input',
      menuId: 'profile-path-menu',
      hint: h(DrillHint, null),
    }),
    h(SchemeSlot, null),
    h(ErrorBlock, { error: view.error }),
    h(Actions, {
      isSubmitting: view.isSubmitting,
      label: 'Create Graph',
      busyLabel: 'Creating...',
      onCancel: on.close,
    }),
  );
harden(GraphForm);

/** @param {{ view: AddSpaceView, on: AddSpaceHandlers }} props */
const FlootForm = ({ view, on }) =>
  h(
    FormShell,
    { title: 'Floot Chat', on },
    h(IconField, { view, on }),
    h(PathSelectorField, {
      label: 'Floot Agent Path',
      inputId: 'profile-path-input',
      menuId: 'profile-path-menu',
      hint: 'Pet-name path to the Floot factory. Auto-detected as floot/controller when present; otherwise pick it from your inventory.',
    }),
    h(
      'div',
      { class: 'add-space-field' },
      h('label', null, 'STT Object Path (optional)'),
      h('input', {
        type: 'text',
        id: 'floot-audio-path',
        class: 'add-space-input',
        placeholder: 'floot/stt',
        value: view.flootAudioPath,
        /** @param {{ target: { value: string } }} e */
        onInput: e => on.flootAudioInput(e.target.value),
      }),
      h(
        'div',
        { class: 'field-hint' },
        'Enable the mic by pointing at a speech-to-text object (slash-separated path). Auto-filled from floot/stt when present; leave blank for text only.',
      ),
    ),
    h(
      'div',
      { class: 'add-space-field' },
      h('label', null, 'TTS Object Path (optional)'),
      h('input', {
        type: 'text',
        id: 'floot-tts-path',
        class: 'add-space-input',
        placeholder: 'floot/tts',
        value: view.flootTtsPath,
        /** @param {{ target: { value: string } }} e */
        onInput: e => on.flootTtsInput(e.target.value),
      }),
      h(
        'div',
        { class: 'field-hint' },
        'Enable spoken replies by pointing at a text-to-speech object (slash-separated path). Auto-filled from floot/tts when present; leave blank for silent.',
      ),
    ),
    h(SchemeSlot, null),
    h(ErrorBlock, { error: view.error }),
    h(Actions, {
      isSubmitting: view.isSubmitting,
      label: 'Create Chat',
      busyLabel: 'Creating...',
      onCancel: on.close,
    }),
  );
harden(FlootForm);

/** @param {{ view: AddSpaceView, on: AddSpaceHandlers }} props */
const PeersForm = ({ view, on }) =>
  h(
    FormShell,
    { title: 'Known Peers', on },
    h(IconField, { view, on }),
    h(SchemeSlot, null),
    h(ErrorBlock, { error: view.error }),
    h(Actions, {
      isSubmitting: view.isSubmitting,
      label: 'Create Space',
      busyLabel: 'Creating...',
      onCancel: on.close,
    }),
  );
harden(PeersForm);

/** @param {{ view: AddSpaceView, on: AddSpaceHandlers }} props */
const FilesForm = ({ view, on }) =>
  h(
    FormShell,
    { title: 'File Explorer', on },
    h(IconField, { view, on }),
    h(
      'div',
      { class: 'field-hint' },
      'Open filesystems by pet name, or create in-memory ones, read-only views, and layers from inside the Space.',
    ),
    h(SchemeSlot, null),
    h(ErrorBlock, { error: view.error }),
    h(Actions, {
      isSubmitting: view.isSubmitting,
      label: 'Create Space',
      busyLabel: 'Creating...',
      onCancel: on.close,
    }),
  );
harden(FilesForm);

/**
 * The root view: dispatch on `view.mode` to the matching screen.
 *
 * @param {object} props
 * @param {AddSpaceView} props.view
 * @param {AddSpaceHandlers} props.on
 */
const AddSpaceView = ({ view, on }) => {
  switch (view.mode) {
    case 'new-agent':
      return h(NewAgentForm, { view, on });
    case 'existing':
      return h(ExistingForm, { view, on });
    case 'new-channel':
      return h(NewChannelForm, { view, on });
    case 'connect-channel':
      return h(ConnectChannelForm, { view, on });
    case 'whylip':
      return h(WhylipForm, { view, on });
    case 'graph':
      return h(GraphForm, { view, on });
    case 'peers':
      return h(PeersForm, { view, on });
    case 'files':
      return h(FilesForm, { view, on });
    case 'floot':
      return h(FlootForm, { view, on });
    default:
      return h(ChooseMode, { view, on });
  }
};
harden(AddSpaceView);

/**
 * @typedef {object} AddSpaceHandlers
 * @property {(mode: string) => void} selectMode
 * @property {() => void} back
 * @property {() => void} close
 * @property {() => void} submit
 * @property {(icon: string) => void} selectIcon
 * @property {(useLetterIcon: boolean) => void} toggleLetterIcon
 * @property {(value: string) => void} handleInput
 * @property {(value: string) => void} agentInput
 * @property {(value: string) => void} channelPetNameInput
 * @property {(value: string) => void} channelProposedNameInput
 * @property {(value: string) => void} channelIntroducedNamesInput
 * @property {(mode: 'chat' | 'forum' | 'outliner' | 'microblog') => void} channelViewMode
 * @property {(mode: 'new' | 'existing') => void} channelPersonaMode
 * @property {(value: string) => void} whylipNameInput
 * @property {(value: string) => void} whylipAgentNameInput
 * @property {(value: string) => void} flootAudioInput
 * @property {(value: string) => void} flootTtsInput
 * @property {(value: string) => void} connectLocatorInput
 * @property {(value: string) => void} connectSpaceNameInput
 * @property {(value: string) => void} connectProposedNameInput
 * @property {(mode: 'new' | 'existing') => void} connectPersonaMode
 * @property {(id: string) => void} connectExistingSpace
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
  /** @type {'choose' | 'new-agent' | 'existing' | 'new-channel' | 'connect-channel' | 'whylip' | 'graph' | 'peers' | 'files' | 'floot'} */
  let mode = 'choose';
  /** @type {string} */
  let whylipName = '';
  /** @type {string} */
  let whylipAgentName = '';
  /** @type {string} */
  let flootAudioPath = '';
  /** @type {string} */
  let flootTtsPath = '';
  // Auto-detected default for the Floot controller path picker (the well-known
  // `floot/controller`, or a probed entry under `floot/`). Null until detection
  // runs / finds nothing, in which case the picker falls back to `['@agent']`.
  /** @type {string[] | null} */
  let flootControllerPath = null;
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
  /** @type {'chat' | 'forum' | 'outliner' | 'microblog'} */
  let channelViewMode = 'chat';
  /** @type {'new' | 'existing'} */
  let channelPersonaMode = 'existing';
  let channelIntroducedNames = '';
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
   * Get the default agent name for a handle.
   * @param {string} handle
   * @returns {string}
   */
  const getDefaultAgentName = handle => {
    return handle ? `profile-for-${handle}` : '';
  };

  /**
   * Build the pure-data snapshot the confined view renders from.
   *
   * @returns {AddSpaceView}
   */
  const buildView = () =>
    harden({
      mode,
      nextIcon: getFirstUnusedIcon(),
      selectedIcon,
      useLetterIcon,
      handleName,
      displayAgentName: agentNameManuallyEdited
        ? agentName
        : getDefaultAgentName(handleName),
      channelPetName,
      channelProposedName,
      channelViewMode,
      channelPersonaMode,
      channelIntroducedNames,
      connectLocator,
      connectSpaceName,
      connectProposedName,
      connectPersonaMode,
      connectExistingSpaceId,
      existingChannelSpaces: getExistingChannelSpaces
        ? getExistingChannelSpaces()
        : [],
      whylipName,
      whylipAgentName,
      flootAudioPath,
      flootTtsPath,
      error,
      isSubmitting,
    });

  /**
   * Render the modal content based on the current mode, then (synchronously,
   * because `renderConfined` is synchronous) mount the scheme picker and the
   * pet-name autocompletes into the slot/anchor elements the view rendered, and
   * focus the primary input — exactly the post-render steps the imperative
   * version ran after its `innerHTML` write.
   */
  const render = () => {
    renderConfined(
      h(AddSpaceView, { view: buildView(), on: handlers }),
      $container,
    );

    // Mount scheme picker into slot if in a form mode
    if (
      mode === 'new-agent' ||
      mode === 'existing' ||
      mode === 'whylip' ||
      mode === 'graph' ||
      mode === 'peers' ||
      mode === 'files' ||
      mode === 'floot'
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

    if (mode === 'existing' || mode === 'graph' || mode === 'floot') {
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
   * Auto-detect the Floot objects under the `floot/` inventory directory:
   * the controller (prefer the well-known `floot/controller`, else probe each
   * entry via `__getMethodNames__()` for `createSession`/`listSessions`) and the
   * optional `floot/stt` / `floot/tts` voice caplets. Best-effort: any failure
   * leaves a field undetected and the form falls back to manual entry.
   *
   * @returns {Promise<{ controller: string[] | null, stt: string[] | null, tts: string[] | null }>}
   */
  const detectFlootObjects = async () => {
    const result = {
      /** @type {string[] | null} */ controller: null,
      /** @type {string[] | null} */ stt: null,
      /** @type {string[] | null} */ tts: null,
    };
    const host = /** @type {ERef<EndoHost>} */ (powers);
    try {
      if (!(await E(host).has('floot'))) return result;
      if (await E(host).has('floot', 'controller')) {
        result.controller = ['floot', 'controller'];
      } else {
        // No well-known name — probe the directory for a factory-shaped object.
        const names = await E(host).list('floot');
        for (const name of names) {
          try {
            // eslint-disable-next-line no-await-in-loop
            const obj =
              /** @type {{ __getMethodNames__: () => Promise<string[]> }} */ (
                await E(host).lookup(['floot', name])
              );
            // eslint-disable-next-line no-await-in-loop, no-underscore-dangle
            const methods = await E(obj).__getMethodNames__();
            if (
              methods.includes('createSession') &&
              methods.includes('listSessions')
            ) {
              result.controller = ['floot', name];
              break;
            }
          } catch {
            // not a factory (or not introspectable) — skip
          }
        }
      }
      if (await E(host).has('floot', 'stt')) result.stt = ['floot', 'stt'];
      if (await E(host).has('floot', 'tts')) result.tts = ['floot', 'tts'];
    } catch {
      // no floot/ directory or powers unavailable — fall back to manual entry
    }
    return result;
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

    // Set default path and focus. In Floot mode, prefer the auto-detected
    // controller (`floot/controller`) so the user rarely types a path.
    pathAutocomplete.setValue(
      mode === 'floot' && flootControllerPath
        ? flootControllerPath
        : ['@agent'],
    );
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
   * The callback bag the confined view invokes. Each handler is a host closure
   * passed as a prop, so it runs in the app realm and mutates wizard state.
   * Where the imperative version avoided a full re-render — icon selection,
   * channel view-mode, and the live text inputs — these update the rendered DOM
   * in place (via `$container` queries) so the embedded controllers, the scheme
   * picker and the pet-name autocompletes, survive between renders.
   *
   * @type {AddSpaceHandlers}
   */
  const handlers = {
    close: () => {
      hide();
      onClose();
    },
    back: () => {
      mode = 'choose';
      error = null;
      render();
    },
    selectMode: selectedMode => {
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
        channelPersonaMode = 'existing';
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
      } else if (selectedMode === 'files') {
        mode = 'files';
        selectedIcon = '📂';
        useLetterIcon = false;
        error = null;
        render();
      } else if (selectedMode === 'floot') {
        mode = 'floot';
        selectedIcon = '💬';
        useLetterIcon = false;
        error = null;
        flootControllerPath = null;
        render();
        // Auto-detect the floot/ objects and re-render with the picker
        // defaulted to the controller and the STT/TTS fields pre-filled. Any
        // values the user has already typed are preserved.
        detectFlootObjects()
          .then(detected => {
            if (mode !== 'floot') return;
            let changed = false;
            if (detected.controller) {
              flootControllerPath = detected.controller;
              changed = true;
            }
            if (detected.stt && !flootAudioPath) {
              flootAudioPath = detected.stt.join('/');
              changed = true;
            }
            if (detected.tts && !flootTtsPath) {
              flootTtsPath = detected.tts.join('/');
              changed = true;
            }
            if (changed) render();
          })
          .catch(() => {});
      }
    },
    submit: () => {
      if (mode === 'new-agent') {
        handleNewAgentSubmit();
      } else if (mode === 'existing') {
        handleExistingSubmit();
      } else if (mode === 'new-channel') {
        handleNewChannelSubmit();
      } else if (mode === 'connect-channel') {
        handleConnectChannelSubmit();
      } else if (mode === 'whylip') {
        handleWhylipSubmit();
      } else if (mode === 'graph') {
        handleGraphSubmit();
      } else if (mode === 'peers') {
        handlePeersSubmit();
      } else if (mode === 'files') {
        handleFilesSubmit();
      } else if (mode === 'floot') {
        handleFlootSubmit();
      }
    },
    selectIcon: icon => {
      selectedIcon = icon;
      // The imperative version updated only the selection highlight (or the
      // letter preview) without a full re-render, to keep embedded controllers
      // alive; preserve that.
      if (useLetterIcon) {
        const $preview = $container.querySelector('.letter-icon-preview');
        if ($preview) $preview.textContent = selectedIcon;
      } else {
        updateIconSelection();
      }
    },
    toggleLetterIcon: useLetter => {
      useLetterIcon = useLetter;
      if (useLetterIcon && selectedIcon.length > 2) {
        selectedIcon = 'AB';
      }
      render();
    },
    handleInput: value => {
      handleName = value;
      // Auto-populate the agent name (unless manually edited) by writing the
      // sibling input directly, avoiding a re-render that would drop focus.
      if (!agentNameManuallyEdited) {
        const $agent = /** @type {HTMLInputElement | null} */ (
          $container.querySelector('#agent-name')
        );
        if ($agent) $agent.value = getDefaultAgentName(handleName);
      }
    },
    agentInput: value => {
      agentName = value;
      if (value !== getDefaultAgentName(handleName)) {
        agentNameManuallyEdited = true;
      }
    },
    channelPetNameInput: value => {
      channelPetName = value;
    },
    channelProposedNameInput: value => {
      channelProposedName = value;
    },
    channelIntroducedNamesInput: value => {
      channelIntroducedNames = value;
    },
    channelViewMode: vm => {
      channelViewMode = vm;
      // Update the highlight in place (no re-render), matching the imperative
      // version, so an open channel-path autocomplete is not torn down.
      for (const $opt of $container.querySelectorAll('.view-mode-option')) {
        $opt.classList.toggle(
          'selected',
          $opt.getAttribute('data-view-mode') === vm,
        );
      }
    },
    channelPersonaMode: m => {
      channelPersonaMode = m;
      render();
    },
    whylipNameInput: value => {
      whylipName = value;
    },
    whylipAgentNameInput: value => {
      whylipAgentName = value;
    },
    flootAudioInput: value => {
      flootAudioPath = value;
    },
    flootTtsInput: value => {
      flootTtsPath = value;
    },
    connectLocatorInput: value => {
      connectLocator = value;
    },
    connectSpaceNameInput: value => {
      connectSpaceName = value;
    },
    connectProposedNameInput: value => {
      connectProposedName = value;
    },
    connectPersonaMode: m => {
      connectPersonaMode = m;
      render();
    },
    connectExistingSpace: id => {
      connectExistingSpaceId = id;
    },
  };

  /**
   * Escape closes the modal (when no autocomplete menu is open), or steps back
   * to the chooser from a sub-mode. Registered once at init (not per render) to
   * avoid the listener leak the imperative version had.
   *
   * @param {KeyboardEvent} e
   */
  const handleEscape = e => {
    if (e.key !== 'Escape' || !visible) return;
    // Don't close if an autocomplete menu is handling the key.
    if (pathAutocomplete && pathAutocomplete.isMenuVisible()) return;
    if (channelPathAutocomplete && channelPathAutocomplete.isMenuVisible()) {
      return;
    }
    if (mode !== 'choose') {
      mode = 'choose';
      error = null;
      render();
      return;
    }
    hide();
    onClose();
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

      // Parse introduced names: comma-separated pet names to copy
      // from parent namespace into the child persona's namespace.
      /** @type {Record<string, string>} */
      const introducedNames = Object.create(null);
      if (channelIntroducedNames.trim()) {
        const entries = channelIntroducedNames
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
        for (const entry of entries) {
          // Support "parentName:childName" or just "name" (same in both)
          const colonIdx = entry.indexOf(':');
          if (colonIdx > 0) {
            const parentName = entry.slice(0, colonIdx).trim();
            const childName = entry.slice(colonIdx + 1).trim();
            if (parentName && childName) {
              introducedNames[parentName] = childName;
            }
          } else {
            introducedNames[entry] = entry;
          }
        }
      }

      await E(
        /** @type {{ provideHost: (name: string, opts: { agentName: string, introducedNames?: Record<string, string> }) => Promise<void> }} */ (
          powers
        ),
      ).provideHost(spaceName, {
        agentName: newAgentName,
        ...(Object.keys(introducedNames).length > 0 ? { introducedNames } : {}),
      });

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

    try {
      // Validate the locator URL shape against the daemon's
      // parseLocator contract; storeLocator below takes the original
      // endo:// locator string and would otherwise surface a terser
      // daemon error to the user on a near-miss.
      assertValidLocator(locator);
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
        //    (subsequent `@`-delimited URL-encoded path components after
        //    the formula address) so the daemon knows how to reach the
        //    remote node.
        const locatorUrl = new URL(locator);
        const nodeNumber = locatorUrl.host;
        const [, ...addresses] = locatorUrl.pathname
          .replace(/^\//, '')
          .split('@')
          .map(decodeURIComponent);
        if (addresses.length > 0 && nodeNumber) {
          await E(
            /** @type {{ addPeerInfo: (info: { node: string, addresses: string[] }) => Promise<void> }} */ (
              powers
            ),
          ).addPeerInfo({ node: nodeNumber, addresses });
        }

        // 1. Create persona (host)
        const personaAgentName = `persona-for-${spaceName}`;
        await E(
          /** @type {{ provideHost: (name: string, opts: { agentName: string }) => Promise<void> }} */ (
            powers
          ),
        ).provideHost(spaceName, { agentName: personaAgentName });

        // 2. Get persona's powers
        const personaPowers = await E(
          /** @type {{ lookup: (...args: string[]) => Promise<unknown> }} */ (
            powers
          ),
        ).lookup(personaAgentName);

        // 3. Write the channel locator into the persona's pet store.
        //    Pass the original endo:// locator so the system can drop
        //    bare-identifier support in the future.
        await E(
          /** @type {{ storeLocator: (name: string | string[], id: string) => Promise<void> }} */ (
            personaPowers
          ),
        ).storeLocator('general', locator);

        // 4. Create space config
        // Use the view mode from the locator if provided, else default chat.
        const recommendedView = locatorUrl.searchParams.get('view');
        /** @type {'chat' | 'forum' | 'outliner' | undefined} */
        const connectViewMode =
          recommendedView === 'forum' || recommendedView === 'outliner'
            ? recommendedView
            : undefined;
        await onSubmit({
          name: spaceName,
          icon: selectedIcon,
          profilePath: [agentName],
          layout: 'channel',
          channelPetName: 'general',
          proposedName: displayName,
          viewMode: connectViewMode,
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
        // (subsequent `@`-delimited URL-encoded path components after the
        // formula address).
        const locatorUrl = new URL(locator);
        const nodeNumber = locatorUrl.host;
        const [, ...addresses] = locatorUrl.pathname
          .replace(/^\//, '')
          .split('@')
          .map(decodeURIComponent);
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

        // Write the channel locator into the persona's pet store.
        // Pass the original endo:// locator so the system can drop
        // bare-identifier support in the future.
        await E(
          /** @type {{ storeLocator: (name: string | string[], id: string) => Promise<void> }} */ (
            personaPowers
          ),
        ).storeLocator('general', locator);

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

      // Get the endo:// locator for the agent profile so we can write
      // it into the whylip host's pet store.  Per issue #150 reply,
      // prefer locate()/storeLocator over identify()/storeIdentifier so
      // the system can drop bare-identifier support in the future.
      const agentLocator = /** @type {string} */ (
        await E(
          /** @type {{ locate: (petName: string) => Promise<string> }} */ (
            powers
          ),
        ).locate(agentProfileName)
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
        /** @type {{ storeLocator: (name: string | string[], id: string) => Promise<void> }} */ (
          whylipPowers
        ),
      ).storeLocator('fae', agentLocator);

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
   * Handle floot chat form submission.
   */
  const handleFlootSubmit = async () => {
    if (!pathAutocomplete) return;

    const paths = pathAutocomplete.getValue();
    if (paths.length === 0) {
      error = 'Please select the Floot agent path';
      render();
      return;
    }

    const pathString = paths[0];
    const profilePath = pathString.split('/').filter(Boolean);

    if (profilePath.length === 0) {
      error = 'Please select a valid Floot agent path';
      render();
      return;
    }

    const name = `${profilePath[profilePath.length - 1]}-chat`;

    const audioPath = flootAudioPath.split('/').filter(Boolean);
    const ttsPath = flootTtsPath.split('/').filter(Boolean);

    isSubmitting = true;
    error = null;
    render();

    try {
      await onSubmit({
        name,
        icon: selectedIcon,
        profilePath,
        layout: 'floot',
        scheme: schemePicker ? schemePicker.getValue() : 'auto',
        ...(audioPath.length ? { audioPath } : {}),
        ...(ttsPath.length ? { ttsPath } : {}),
      });
      hide({ restoreScheme: false });
      onClose();
    } catch (err) {
      error = `Failed to create floot chat space: ${/** @type {Error} */ (err).message}`;
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
   * Handle file explorer form submission.
   */
  const handleFilesSubmit = async () => {
    isSubmitting = true;
    error = null;
    render();

    try {
      await onSubmit({
        name: 'files',
        icon: selectedIcon,
        profilePath: [],
        layout: 'files',
        scheme: schemePicker ? schemePicker.getValue() : 'auto',
      });
      hide({ restoreScheme: false });
      onClose();
    } catch (err) {
      error = `Failed to create files space: ${/** @type {Error} */ (err).message}`;
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
    channelPersonaMode = 'existing';
    connectLocator = '';
    connectSpaceName = '';
    connectProposedName = '';
    connectPersonaMode = 'new';
    connectExistingSpaceId = null;
    whylipName = '';
    whylipAgentName = '';
    flootAudioPath = '';
    flootTtsPath = '';
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

  // One Escape listener for the modal's lifetime (the imperative version
  // re-added one on every render).
  document.addEventListener('keydown', handleEscape);

  return harden({ show, hide, isVisible });
};
harden(createAddSpaceModal);
