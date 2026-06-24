// @ts-check

import harden from '@endo/harden';
import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';

import { SessionSidebar } from './SessionSidebar.js';
import { MessageList } from './MessageList.js';
import { ComposeBar } from './ComposeBar.js';
import { SettingsPanel } from './SettingsPanel.js';

/** @import { VNode } from 'preact' */
/** @import { FlootController, FlootPreset, FlootModel, FlootSafeEvent } from './types.js' */

// Floot voice-assistant space as a PURE confined Preact component. The host
// (packages/chat/floot-component.js) owns the imperative engine — mic capture,
// Web Audio, the VAD loop, the background-turn registry, CapTP resolution — and
// passes it down as a `controller` (pure-data snapshots + callbacks). Nothing
// here touches the DOM or any audio/browser API; see DESIGN.md.

// Re-render whenever the host controller's state changes. The controller
// instance is stable for the mount, so the subscription is mount-once.
/** @param {FlootController} controller */
const useControllerState = controller => {
  const [, setTick] = useState(0);
  // Mount-once: the controller instance is stable for this mount.
  useEffect(() => controller.subscribe(() => setTick(t => t + 1)), []);
  return controller.getState();
};

const formatTokens = (/** @type {number} */ n) => {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return `${n}`;
};

/**
 * @param {{
 *   presets: FlootPreset[],
 *   models: FlootModel[],
 *   onPick: (id: string, model: string) => void,
 *   onClose: () => void,
 * }} props
 * @returns {VNode}
 */
const PresetModal = ({ presets, models, onPick, onClose }) => {
  // Pre-select the factory's default model (falling back to the first listed),
  // so picking a preset alone still creates a session with a sensible model.
  const preferred = models.find(m => m.default) || models[0];
  const [model, setModel] = useState(preferred ? preferred.id : '');
  return h(
    'div',
    { class: 'floot-modal-backdrop', onClick: onClose },
    h(
      'div',
      // Clicks on the card surface must not reach the dismiss-on-backdrop click.
      {
        class: 'floot-modal',
        onClick: (/** @type {FlootSafeEvent} */ e) => e.stopPropagation(),
      },
      h('div', { class: 'floot-modal-title' }, 'Start a new session'),
      models.length
        ? h(
            'label',
            { class: 'floot-modal-field' },
            h('span', { class: 'floot-modal-label' }, 'Model'),
            h(
              'select',
              {
                class: 'floot-model-select',
                value: model,
                onChange: (/** @type {FlootSafeEvent} */ e) =>
                  setModel(e.target.value),
              },
              models.map(m =>
                h(
                  'option',
                  { key: m.id, value: m.id },
                  `${m.title}${m.default ? ' (default)' : ''}`,
                ),
              ),
            ),
          )
        : null,
      h(
        'div',
        { class: 'floot-preset-list' },
        presets.map(p =>
          h(
            'button',
            {
              type: 'button',
              key: p.id,
              class: 'floot-preset-card',
              onClick: () => onPick(p.id, model),
            },
            h('div', { class: 'floot-preset-name' }, p.title),
            h('div', { class: 'floot-preset-desc' }, p.description || ''),
          ),
        ),
      ),
    ),
  );
};
harden(PresetModal);

/**
 * @param {{ controller: FlootController }} props
 * @returns {VNode}
 */
export const FlootApp = ({ controller }) => {
  const state = useControllerState(controller);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  const { sessions, activeSessionId, presets, models, usage, status } = state;
  const active = sessions.find(s => s.id === activeSessionId);

  const onNew = () => {
    // Skip the modal only when there is nothing to choose — a single preset and
    // no model alternatives. Multiple models alone still warrant the picker.
    if (presets.length <= 1 && models.length <= 1) {
      controller.newSession(presets[0] ? presets[0].id : undefined);
      setDrawerOpen(false);
    } else {
      setModalOpen(true);
    }
  };
  const pickPreset = (
    /** @type {string} */ id,
    /** @type {string} */ model,
  ) => {
    setModalOpen(false);
    setDrawerOpen(false);
    controller.newSession(id, model);
  };

  const commitTitle = () => {
    const title = titleDraft.trim();
    setTitleEditing(false);
    if (title && active) controller.renameSession(active.id, title);
  };

  const tokenLabel =
    usage && (usage.inputTokens || usage.outputTokens)
      ? `↑${formatTokens(usage.inputTokens)} ↓${formatTokens(usage.outputTokens)}`
      : '';

  const header = h(
    'div',
    { class: 'floot-header' },
    h(
      'button',
      {
        type: 'button',
        class: 'floot-menu-btn',
        'aria-label': 'Sessions',
        onClick: () => setDrawerOpen(o => !o),
      },
      '☰',
    ),
    titleEditing
      ? h('input', {
          class: 'floot-header-title-input',
          value: titleDraft,
          autofocus: true,
          onInput: (/** @type {FlootSafeEvent} */ e) =>
            setTitleDraft(e.target.value),
          onKeyDown: (/** @type {FlootSafeEvent} */ e) => {
            if (e.key === 'Enter') commitTitle();
            else if (e.key === 'Escape') setTitleEditing(false);
          },
          onBlur: commitTitle,
        })
      : h(
          'div',
          {
            class: 'floot-header-title',
            title: 'Double-click to rename',
            onDblClick: () => {
              if (!active) return;
              setTitleDraft(active.title);
              setTitleEditing(true);
            },
          },
          active ? active.title : 'Floot',
        ),
    h(
      'button',
      {
        type: 'button',
        class: `floot-header-btn${state.settingsOpen ? ' on' : ''}`,
        'aria-label': 'Settings & transcription',
        onClick: () => controller.toggleSettings(),
      },
      '⚙',
    ),
  );

  const statusBar = h(
    'div',
    { class: 'floot-status-bar' },
    h('span', null, status || ''),
    h('span', { class: 'floot-tokens' }, tokenLabel),
  );

  return h(
    'div',
    { class: 'floot-app' },
    h(SessionSidebar, {
      state,
      controller,
      open: drawerOpen,
      onNew,
      onAfterSelect: () => setDrawerOpen(false),
    }),
    h('div', {
      class: `floot-backdrop${drawerOpen ? ' open' : ''}`,
      onClick: () => setDrawerOpen(false),
    }),
    h(
      'div',
      { class: 'floot-main' },
      header,
      state.settingsOpen
        ? h(SettingsPanel, { state })
        : h(MessageList, { state, controller }),
      statusBar,
      h(ComposeBar, { state, controller }),
    ),
    modalOpen
      ? h(PresetModal, {
          presets,
          models,
          onPick: pickPreset,
          onClose: () => setModalOpen(false),
        })
      : null,
  );
};
harden(FlootApp);
