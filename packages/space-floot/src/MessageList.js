// @ts-check

import harden from '@endo/harden';
import { h } from 'preact';

/** @import { VNode } from 'preact' */
/** @import { FlootMessage, FlootState, FlootController } from './types.js' */

// Transcript renderer: history + the live turn, as discrete bubbles and tool
// rows. Pure view — `messages` and `streamingText` come from the host
// controller's snapshot; nothing here touches the DOM or audio.

const ToolBlock = (
  /** @type {string} */ name,
  /** @type {string} */ content,
  /** @type {boolean} */ isResult,
) =>
  h(
    'div',
    { class: 'floot-msg-row assistant' },
    h(
      'div',
      { class: `floot-tool${isResult ? ' result' : ''}` },
      h(
        'div',
        { class: 'floot-tool-label' },
        `${name || 'tool'}${isResult ? ' result' : ''}`,
      ),
      h('pre', { class: 'floot-tool-pre' }, content),
    ),
  );

/**
 * @param {{ msg: FlootMessage, canReplay: boolean, onReplay: (text: string) => void, replaying: boolean }} props
 * @returns {VNode}
 */
const Bubble = ({ msg, canReplay, onReplay, replaying }) => {
  const text = msg.text || '';
  const mailFrom = msg.meta && msg.meta.mail && msg.meta.mail.from;
  const rowClass = `floot-msg-row ${msg.role}${mailFrom ? ' mail' : ''}`;
  const caption = mailFrom
    ? h(
        'div',
        { class: 'floot-mail-caption' },
        'Mail from ',
        h('span', { class: 'token message-token' }, `@${mailFrom}`),
      )
    : null;
  const bubble = h('div', { class: 'floot-msg' }, text);
  // A finished assistant message offers a replay button when TTS is wired.
  if (msg.role === 'assistant' && canReplay && text.trim()) {
    return h(
      'div',
      { class: rowClass },
      caption,
      h(
        'div',
        { class: 'floot-bubble-wrap' },
        bubble,
        h(
          'button',
          {
            type: 'button',
            class: `floot-replay${replaying ? ' playing' : ''}`,
            'aria-label': 'Replay',
            onClick: () => onReplay(text),
          },
          '▶',
        ),
      ),
    );
  }
  return h('div', { class: rowClass }, caption, bubble);
};
harden(Bubble);

const ThinkingRow = () =>
  h(
    'div',
    { class: 'floot-msg-row assistant' },
    h(
      'div',
      { class: 'floot-thinking' },
      h('span', null),
      h('span', null),
      h('span', null),
    ),
  );

/**
 * @param {{ state: FlootState, controller: FlootController }} props
 * @returns {VNode}
 */
export const MessageList = ({ state, controller }) => {
  const { messages, streamingText, busy, loaded, voice } = state;
  const canReplay = Boolean(voice && voice.hasTts);
  const replayingText = voice && voice.replayingText;

  if (!loaded) {
    return h(
      'div',
      { class: 'floot-messages' },
      h(
        'div',
        { class: 'floot-empty-state floot-loading' },
        h('span', { class: 'floot-spinner' }),
        'Loading session…',
      ),
    );
  }

  const hasContent = messages.length > 0 || streamingText || busy;
  if (!hasContent) {
    return h(
      'div',
      { class: 'floot-messages' },
      h('div', { class: 'floot-empty-state' }, 'Say hello to Floot.'),
    );
  }

  const rows = [];
  for (let i = 0; i < messages.length; i += 1) {
    const msg = messages[i];
    if (msg.role === 'tool') {
      rows.push(ToolBlock(msg.name || '', msg.args || '', false));
      if (msg.result != null) {
        rows.push(ToolBlock(msg.name || '', msg.result, true));
      }
    } else {
      rows.push(
        h(Bubble, {
          msg,
          canReplay,
          replaying: canReplay && replayingText === (msg.text || ''),
          onReplay: text => controller.replayMessage(text),
        }),
      );
    }
  }
  // The in-progress assistant bubble, or a thinking indicator before any text.
  if (streamingText) {
    rows.push(
      h(
        'div',
        { class: 'floot-msg-row assistant' },
        h('div', { class: 'floot-msg streaming' }, streamingText),
      ),
    );
  } else if (busy) {
    rows.push(h(ThinkingRow, null));
  }

  return h('div', { class: 'floot-messages' }, rows);
};
harden(MessageList);
