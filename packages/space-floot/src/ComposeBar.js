// @ts-check

import harden from '@endo/harden';
import { h, Fragment } from 'preact';

/** @import { VNode } from 'preact' */
/** @import { FlootState, FlootController, FlootVoiceState, FlootSafeEvent } from './types.js' */

// The VAD level meter (shown only while the mic is open). The host pre-scales
// the level / noise-floor / threshold to 0..100 percentages so the view stays
// pure arithmetic-free.
const VadMeter = (/** @type {FlootVoiceState} */ voice) =>
  h(
    'div',
    { class: `floot-meter${voice.micActive ? ' on' : ''}` },
    h('div', {
      class: `floot-meter-fill${voice.speaking ? ' active' : ''}`,
      style: { width: `${voice.meterPct || 0}%` },
    }),
    h('div', {
      class: 'floot-meter-noise',
      style: { left: `${voice.noisePct || 0}%` },
    }),
    h('div', {
      class: 'floot-meter-threshold',
      style: { left: `${voice.thresholdPct || 0}%` },
    }),
  );

/**
 * @param {{ state: FlootState, controller: FlootController }} props
 * @returns {VNode}
 */
export const ComposeBar = ({ state, controller }) => {
  const { input, busy, voice } = state;

  const onKeyDown = (/** @type {FlootSafeEvent} */ e) => {
    // Enter sends; Shift+Enter inserts a newline.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      controller.send();
    }
  };

  const micButton =
    voice && voice.hasMic
      ? h(
          'button',
          {
            type: 'button',
            class: `floot-mic${voice.micActive ? ' listening' : ''}${
              voice.speaking ? ' recording' : ''
            }`,
            'aria-label': voice.micActive
              ? 'Stop listening'
              : 'Start listening',
            onClick: () => controller.toggleMic(),
          },
          '🎤',
        )
      : null;

  const speakerButton =
    voice && voice.hasTts
      ? h(
          'button',
          {
            type: 'button',
            class: `floot-mic floot-speaker${voice.ttsEnabled ? ' on' : ''}${
              voice.ttsSpeaking ? ' speaking' : ''
            }`,
            'aria-label': voice.ttsEnabled ? 'Mute replies' : 'Speak replies',
            onClick: () => controller.toggleTts(),
          },
          '🔊',
        )
      : null;

  return h(
    Fragment,
    null,
    voice && voice.hasMic ? VadMeter(voice) : null,
    h(
      'div',
      { class: 'floot-compose' },
      h('textarea', {
        class: 'floot-input',
        rows: 1,
        placeholder: 'Message Floot…',
        value: input || '',
        onInput: (/** @type {FlootSafeEvent} */ e) =>
          controller.setInput(e.target.value),
        onKeyDown,
      }),
      micButton,
      speakerButton,
      h(
        'button',
        {
          type: 'button',
          class: `floot-send${busy ? ' cancel' : ''}`,
          'aria-label': busy ? 'Stop' : 'Send',
          onClick: () => (busy ? controller.stop() : controller.send()),
        },
        busy ? '■' : '↑',
      ),
    ),
  );
};
harden(ComposeBar);
