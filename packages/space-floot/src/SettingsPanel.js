// @ts-check

import harden from '@endo/harden';
import { h } from 'preact';

/** @import { VNode } from 'preact' */
/** @import { FlootState } from './types.js' */

// The folded-in Transcription/Voice surface, now a debug/settings panel inside
// Floot rather than a standalone space. Pure view over the controller snapshot:
// live transcript, mic/VAD state, the wired STT/TTS/controller objects, and
// per-session token totals.

const Row = (/** @type {string} */ label, /** @type {any} */ value) =>
  h(
    'div',
    { class: 'floot-settings-row' },
    h('div', { class: 'floot-settings-label' }, label),
    h('div', null, value),
  );

/**
 * @param {{ state: FlootState }} props
 * @returns {VNode}
 */
export const SettingsPanel = ({ state }) => {
  const { voice, usage, objects } = state;
  const v = voice || {};
  const obj = objects || {};

  const transcription = v.hasMic
    ? [
        Row(
          'Mic',
          v.micActive
            ? v.speaking
              ? 'listening (speaking)'
              : 'listening'
            : 'off',
        ),
        Row('Live transcript', v.transcript || '—'),
        Row(
          'VAD',
          `level ${Math.round(v.meterPct || 0)}% · threshold ${Math.round(
            v.thresholdPct || 0,
          )}%`,
        ),
      ]
    : [Row('Mic', 'no STT object wired')];

  const speech = v.hasTts
    ? [Row('Spoken replies', v.ttsEnabled ? 'on' : 'off')]
    : [Row('Spoken replies', 'no TTS object wired')];

  const tokens = usage
    ? Row('Tokens', `↑${usage.inputTokens} ↓${usage.outputTokens}`)
    : Row('Tokens', '—');

  return h(
    'div',
    { class: 'floot-messages' },
    h(
      'div',
      { class: 'floot-settings' },
      h('div', { class: 'floot-modal-title' }, 'Transcription & settings'),
      ...transcription,
      ...speech,
      tokens,
      Row('Controller', obj.controller || '—'),
      Row('STT', obj.stt || '—'),
      Row('TTS', obj.tts || '—'),
    ),
  );
};
harden(SettingsPanel);
