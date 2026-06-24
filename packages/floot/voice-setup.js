// @ts-check
/* global process */
// endo run --UNCONFINED voice-setup.js --powers @agent \
//   -E FLOOT_TTS_MODEL=/abs/path/to/voice.onnx   (optionally -E FLOOT_DIR=floot)
//
// Provisions the two voice halves as separate unconfined caplets under the
// `floot/` inventory directory: the STT object ("floot/stt", moonshine via uv)
// and the TTS object ("floot/tts", piper). They stay distinct daemon objects
// (each its own formula) so either can be swapped for an alternative
// implementation. A Floot Chat Space auto-detects them at floot/stt, floot/tts.
//
// Requires on this machine: `uv` (for the self-contained moonshine STT script)
// and a `piper` binary plus a voice model (FLOOT_TTS_MODEL points at the .onnx;
// its companion .onnx.json must sit next to it).

import { E } from '@endo/eventual-send';

const audioCapletSpecifier = new URL(
  'voice/audio-server-caplet.js',
  import.meta.url,
).href;
const ttsCapletSpecifier = new URL(
  'voice/tts-server-caplet.js',
  import.meta.url,
).href;
const moonshineScript = new URL('voice/moonshine_daemon.py', import.meta.url)
  .pathname;
const voiceDir = new URL('voice/', import.meta.url).pathname;

/**
 * Stand up (or replace) the floot-stt and floot-tts caplets.
 *
 * @param {import('@endo/eventual-send').ERef<object>} agent
 */
export const main = async agent => {
  const dir = process.env.FLOOT_DIR || 'floot';
  const sttPath = [dir, 'stt'];
  const ttsPath = [dir, 'tts'];

  const ttsModel = process.env.FLOOT_TTS_MODEL || '';
  if (!ttsModel) {
    throw new Error(
      'FLOOT_TTS_MODEL (absolute path to a piper .onnx voice) is required.',
    );
  }

  // Ensure the floot/ directory exists (idempotent; shared with the factory).
  if (!(await E(agent).has(dir))) {
    await E(agent).makeDirectory(dir);
  }

  if (await E(agent).has(dir, 'stt')) {
    await E(agent).remove(dir, 'stt');
  }
  console.log(`Standing up STT caplet as "${dir}/stt" (loads moonshine)...`);
  await E(agent).makeUnconfined(undefined, audioCapletSpecifier, {
    resultName: sttPath,
    env: harden({
      FLOOT_STT_SCRIPT: moonshineScript,
      FLOOT_PROJECT_DIR: voiceDir,
      FLOOT_STT_LANG: process.env.FLOOT_STT_LANG || 'en',
    }),
  });

  if (await E(agent).has(dir, 'tts')) {
    await E(agent).remove(dir, 'tts');
  }
  console.log(`Standing up TTS caplet as "${dir}/tts" (piper)...`);
  await E(agent).makeUnconfined(undefined, ttsCapletSpecifier, {
    resultName: ttsPath,
    env: harden({
      FLOOT_TTS_BINARY: process.env.FLOOT_TTS_BINARY || 'piper',
      FLOOT_TTS_MODEL: ttsModel,
      FLOOT_TTS_SPEED: process.env.FLOOT_TTS_SPEED || '1.0',
    }),
  });

  console.log(
    `Done. "${dir}/stt" and "${dir}/tts" are in your inventory; a Floot Chat ` +
      `Space auto-detects them.`,
  );
};
harden(main);
