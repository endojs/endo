// @ts-check

import harden from '@endo/harden';
import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';

import { SessionSidebar } from './SessionSidebar.js';
import { MessageList } from './MessageList.js';
import { ComposeBar } from './ComposeBar.js';
import { SettingsPanel } from './SettingsPanel.js';

/** @import { VNode } from 'preact' */
/** @import { FlootController } from './types.js' */

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
 * @param {{ presets: any[], onPick: (id: string) => void, onClose: () => void }} props
 * @returns {VNode}
 */
const PresetModal = ({ presets, onPick, onClose }) =>
  h(
    'div',
    { class: 'floot-modal-backdrop', onClick: onClose },
    h(
      'div',
      // Clicks on the card surface must not reach the dismiss-on-backdrop click.
      {
        class: 'floot-modal',
        onClick: (/** @type {any} */ e) => e.stopPropagation(),
      },
      h('div', { class: 'floot-modal-title' }, 'Start a new session'),
      h(
        'div',
        { class: 'floot-preset-list' },
        presets.map((/** @type {any} */ p) =>
          h(
            'button',
            {
              type: 'button',
              key: p.id,
              class: 'floot-preset-card',
              onClick: () => onPick(p.id),
            },
            h('div', { class: 'floot-preset-name' }, p.title),
            h('div', { class: 'floot-preset-desc' }, p.description || ''),
          ),
        ),
      ),
    ),
  );
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

  const { sessions, activeSessionId, presets, usage, status } = state;
  const active = sessions.find(
    (/** @type {any} */ s) => s.id === activeSessionId,
  );

  const onNew = () => {
    if (presets.length <= 1) {
      controller.newSession(presets[0] ? presets[0].id : undefined);
      setDrawerOpen(false);
    } else {
      setModalOpen(true);
    }
  };
  const pickPreset = (/** @type {string} */ id) => {
    setModalOpen(false);
    setDrawerOpen(false);
    controller.newSession(id);
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
          onInput: (/** @type {any} */ e) => setTitleDraft(e.target.value),
          onKeyDown: (/** @type {any} */ e) => {
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
          onPick: pickPreset,
          onClose: () => setModalOpen(false),
        })
      : null,
  );
};
harden(FlootApp);
