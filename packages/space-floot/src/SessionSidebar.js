// @ts-check

import harden from '@endo/harden';
import { h } from 'preact';
import { useState } from 'preact/hooks';

/** @import { VNode } from 'preact' */
/** @import { FlootState, FlootController, FlootSessionMeta, FlootSafeEvent } from './types.js' */

// Short noun shown on the per-session pill: the preset title reads as an action
// ("New project"); the pill wants the capability noun.
const PILL_LABELS = harden({
  'new-project': 'project',
  'full-control': 'endo',
});

const DEFAULT_PRESET_ID = 'general';

/**
 * @param {{
 *   state: FlootState,
 *   controller: FlootController,
 *   open: boolean,
 *   onNew: () => void,
 *   onAfterSelect: () => void,
 * }} props
 * @returns {VNode}
 */
export const SessionSidebar = ({
  state,
  controller,
  open,
  onNew,
  onAfterSelect,
}) => {
  const { sessions, activeSessionId, presets } = state;
  const [editingId, setEditingId] = useState(
    /** @type {string | null} */ (null),
  );
  const [draft, setDraft] = useState('');

  const pillLabel = (/** @type {string} */ id) => {
    if (PILL_LABELS[id]) return PILL_LABELS[id];
    const preset = presets.find(p => p.id === id);
    return preset ? preset.title : id;
  };

  const beginRename = (/** @type {FlootSessionMeta} */ session) => {
    setEditingId(session.id);
    setDraft(session.title);
  };
  const commitRename = (/** @type {string} */ id) => {
    const title = draft.trim();
    setEditingId(null);
    if (title) controller.renameSession(id, title);
  };

  const select = (/** @type {string} */ id) => {
    if (state.busy) return; // don't switch context mid-turn
    controller.selectSession(id);
    onAfterSelect();
  };

  const items = sessions.length
    ? sessions.map(session => {
        const status = session.status || 'idle';
        const editing = editingId === session.id;
        return h(
          'div',
          {
            key: session.id,
            class: `floot-session-item${session.id === activeSessionId ? ' active' : ''}`,
            onClick: () => !editing && select(session.id),
          },
          h('span', {
            class: `floot-status-dot${status === 'idle' ? '' : ` ${status}`}`,
          }),
          h(
            'div',
            { class: 'floot-session-meta' },
            editing
              ? h('input', {
                  class: 'floot-session-title-input',
                  value: draft,
                  autofocus: true,
                  onClick: (/** @type {FlootSafeEvent} */ e) =>
                    e.stopPropagation(),
                  onInput: (/** @type {FlootSafeEvent} */ e) =>
                    setDraft(e.target.value),
                  onKeyDown: (/** @type {FlootSafeEvent} */ e) => {
                    if (e.key === 'Enter') commitRename(session.id);
                    else if (e.key === 'Escape') setEditingId(null);
                  },
                  onBlur: () => commitRename(session.id),
                })
              : h(
                  'div',
                  {
                    class: 'floot-session-name',
                    onDblClick: (/** @type {FlootSafeEvent} */ e) => {
                      e.stopPropagation();
                      beginRename(session);
                    },
                  },
                  session.title,
                ),
            h(
              'div',
              { class: 'floot-session-sub' },
              session.messageCount
                ? `${session.messageCount} message${session.messageCount === 1 ? '' : 's'}`
                : session.loaded
                  ? 'empty'
                  : '',
            ),
            session.presetId && session.presetId !== DEFAULT_PRESET_ID
              ? h(
                  'span',
                  { class: 'floot-session-pill' },
                  pillLabel(session.presetId),
                )
              : null,
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'floot-row-btn',
              'aria-label': 'Rename',
              onClick: (/** @type {FlootSafeEvent} */ e) => {
                e.stopPropagation();
                beginRename(session);
              },
            },
            '✎',
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'floot-row-btn',
              'aria-label': 'Delete',
              onClick: (/** @type {FlootSafeEvent} */ e) => {
                e.stopPropagation();
                controller.deleteSession(session.id);
              },
            },
            '🗑',
          ),
        );
      })
    : [h('div', { class: 'floot-session-empty' }, 'No sessions yet')];

  return h(
    'div',
    { class: `floot-sidebar${open ? ' open' : ''}` },
    h(
      'div',
      { class: 'floot-sidebar-head' },
      h('div', { class: 'floot-sidebar-title' }, 'Sessions'),
      h(
        'button',
        {
          type: 'button',
          class: 'floot-new-btn',
          'aria-label': 'New session',
          onClick: onNew,
        },
        '+',
      ),
    ),
    h('div', { class: 'floot-session-list' }, items),
  );
};
harden(SessionSidebar);
