// @ts-check
/* global process */
// endo run --UNCONFINED voice-setup.js --powers @agent \
//   -E FLOOT_TTS_MODEL=/abs/path/to/voice.onnx \
//   -E STT_PETNAME=floot-stt -E TTS_PETNAME=floot-tts
//
// Provisions the two voice halves as separate unconfined caplets in the daemon
// inventory: the STT object ("floot-stt", moonshine via uv) and the TTS object
// ("floot-tts", piper). They stay distinct daemon objects (each its own
// formula) so either can be swapped for an alternative implementation. A Floot
// Chat Space looks them up by pet-name to stream transcription / synthesis.
//
// Requires on this machine: `uv` (for the self-contained moonshine STT script)
// and a `piper` binary plus a voice model (FLOOT_TTS_MODEL points at the .onnx;
// its companion .onnx.json must sit next to it).

import { E } from '@endo/eventual-send';

const audioCapletSpecifier = new URL(
  'voice/audio-server-caplet.mjs',
  import.meta.url,
).href;
const ttsCapletSpecifier = new URL(
  'voice/tts-server-caplet.mjs',
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
  const sttPetname = process.env.STT_PETNAME || 'floot-stt';
  const ttsPetname = process.env.TTS_PETNAME || 'floot-tts';

  const ttsModel = process.env.FLOOT_TTS_MODEL || '';
  if (!ttsModel) {
    throw new Error(
      'FLOOT_TTS_MODEL (absolute path to a piper .onnx voice) is required.',
    );
  }

  const hasStt = await E(agent).has(sttPetname);
  if (hasStt) {
    await E(agent).remove(sttPetname);
  }
  console.log(`Standing up STT caplet as "${sttPetname}" (loads moonshine)...`);
  await E(agent).makeUnconfined(undefined, audioCapletSpecifier, {
    resultName: sttPetname,
    env: harden({
      FLOOT_STT_SCRIPT: moonshineScript,
      FLOOT_PROJECT_DIR: voiceDir,
      FLOOT_STT_LANG: process.env.FLOOT_STT_LANG || 'en',
    }),
  });

  const hasTts = await E(agent).has(ttsPetname);
  if (hasTts) {
    await E(agent).remove(ttsPetname);
  }
  console.log(`Standing up TTS caplet as "${ttsPetname}" (piper)...`);
  await E(agent).makeUnconfined(undefined, ttsCapletSpecifier, {
    resultName: ttsPetname,
    env: harden({
      FLOOT_TTS_BINARY: process.env.FLOOT_TTS_BINARY || 'piper',
      FLOOT_TTS_MODEL: ttsModel,
      FLOOT_TTS_SPEED: process.env.FLOOT_TTS_SPEED || '1.0',
    }),
  });

  console.log(
    `Done. "${sttPetname}" and "${ttsPetname}" are in your inventory. In a ` +
      `Floot Chat Space set STT path "${sttPetname}", TTS path "${ttsPetname}".`,
  );
};
harden(main);
