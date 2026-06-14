// @ts-check

import { E, Far } from '@endo/far';
import harden from '@endo/harden';

/**
 * Voice Space (M2b). Resolves an audio server object from the profilePath
 * (an unconfined caplet in the inventory — see §11 of
 * docs/endo-daemon-integration.md in the floot repo), captures mic audio as
 * 16 kHz mono s16le PCM, streams it to the object as `bytes` events, and
 * renders the transcript the object streams back.
 *
 * The object's interface is `transcribe(audioReader) -> textReader`, where both
 * are async-iterator exos yielding the floot stream wire shape:
 *   audioReader: { type: 'bytes', b64 } ... { type: 'end' }
 *   textReader:  { type: 'phase', phase } | { type: 'partial', text }
 *              | { type: 'final', text } | { type: 'end' } | { type: 'abort', reason }
 * Transcript events carry the full transcript so far (replace, not append),
 * because moonshine partials are cumulative and revise earlier words.
 *
 * @param {HTMLElement} $parent
 * @param {unknown} rootPowers
 * @param {string[]} profilePath
 * @param {(newPath: string[]) => void} _onProfileChange
 * @returns {() => void} cleanup function
 */
export const voiceComponent = (
  $parent,
  rootPowers,
  profilePath,
  _onProfileChange,
) => {
  $parent.innerHTML = '';

  // Resolve the audio object by walking the profile path, exactly like the
  // whylip Space resolves its agent.
  /** @type {any} */
  let audioServer = rootPowers;
  for (const name of profilePath) {
    audioServer = E(/** @type {any} */ (audioServer)).lookup(name);
  }

  // ── UI ────────────────────────────────────────────────────────────────────
  // Sentences stack bottom-up in the centre: the live line sits just above the
  // record button, completed sentences rise and fade into a gradient at the top.
  const $root = document.createElement('div');
  $root.className = 'voice-space';
  $root.innerHTML = `
    <style>
      .voice-space { position: relative; height: 100%; box-sizing: border-box;
        display: flex; flex-direction: column; overflow: hidden; }
      .voice-status { position: absolute; top: 0.75rem; left: 0; right: 0;
        text-align: center; font-size: 0.8rem; opacity: 0.5; pointer-events: none; }
      .voice-stage { flex: 1; min-height: 0; display: flex; flex-direction: column;
        justify-content: flex-end; align-items: center; text-align: center;
        gap: 0.55rem; padding: 2.5rem 1.5rem 8.5rem; box-sizing: border-box;
        overflow: hidden;
        -webkit-mask-image: linear-gradient(to bottom, transparent 0%,
          rgba(0,0,0,0.12) 16%, #000 42%);
        mask-image: linear-gradient(to bottom, transparent 0%,
          rgba(0,0,0,0.12) 16%, #000 42%); }
      .voice-line { font-size: 1.5rem; line-height: 1.4; max-width: 36rem;
        opacity: 0.8; transition: opacity 0.4s ease; }
      .voice-line.current { opacity: 1; font-weight: 500; }
      .voice-record { position: absolute; bottom: 2rem; left: 50%;
        transform: translateX(-50%); width: 78px; height: 78px; border-radius: 50%;
        border: none; background: #e0245e; cursor: pointer;
        box-shadow: 0 6px 20px rgba(0,0,0,0.28);
        transition: transform 0.15s ease, background 0.15s ease;
        display: flex; align-items: center; justify-content: center; }
      .voice-record::before { content: ''; width: 28px; height: 28px;
        border-radius: 50%; background: #fff; transition: all 0.2s ease; }
      .voice-record:hover { transform: translateX(-50%) scale(1.06); }
      .voice-record.recording { background: #b3123f;
        animation: voice-pulse 1.4s ease-in-out infinite; }
      .voice-record.recording::before { width: 24px; height: 24px;
        border-radius: 6px; }
      @keyframes voice-pulse {
        0%, 100% { box-shadow: 0 6px 20px rgba(224,36,94,0.35); }
        50% { box-shadow: 0 6px 32px rgba(224,36,94,0.75); } }
    </style>
    <div class="voice-status" id="voice-status">Ready.</div>
    <div class="voice-stage" id="voice-stage"></div>
    <button type="button" class="voice-record" id="voice-record"
      aria-label="Record"></button>
  `;
  $parent.appendChild($root);

  const $status = /** @type {HTMLElement} */ (
    $root.querySelector('#voice-status')
  );
  const $stage = /** @type {HTMLElement} */ ($root.querySelector('#voice-stage'));
  const $record = /** @type {HTMLButtonElement} */ (
    $root.querySelector('#voice-record')
  );

  // Committed sentences plus the in-progress live line.
  /** @type {string[]} */
  let lines = [];
  let currentText = '';

  const setStatus = (/** @type {string} */ s) => {
    $status.textContent = s;
  };

  const renderTranscript = () => {
    $stage.innerHTML = '';
    for (const line of lines) {
      const $l = document.createElement('div');
      $l.className = 'voice-line';
      $l.textContent = line;
      $stage.appendChild($l);
    }
    if (currentText) {
      const $c = document.createElement('div');
      $c.className = 'voice-line current';
      $c.textContent = currentText;
      $stage.appendChild($c);
    }
  };

  // Transcript events carry the *full* transcript so far (moonshine revises
  // earlier words mid-stream), so re-derive the displayed lines from scratch on
  // every update rather than accreting. Sentences ending in . ! ? … (plus any
  // closing quote/bracket) followed by whitespace become their own line; the
  // trailing fragment is the live current line. On the final event the tail is
  // committed too.
  const SENTENCE_BOUNDARY = /[.!?…]+["'”’)\]]*(?=\s)/;
  const renderFromFull = (/** @type {string} */ full, /** @type {boolean} */ isFinal) => {
    const complete = [];
    let rest = full;
    for (;;) {
      const m = SENTENCE_BOUNDARY.exec(rest);
      if (!m) break;
      const endIdx = m.index + m[0].length;
      const sentence = rest.slice(0, endIdx).trim();
      if (sentence) complete.push(sentence);
      rest = rest.slice(endIdx).replace(/^\s+/, '');
    }
    const tail = rest.trim();
    if (isFinal && tail) {
      complete.push(tail);
      currentText = '';
    } else {
      currentText = tail;
    }
    lines = complete;
    renderTranscript();
  };

  // ── Browser-side audio stream channel (floot stream wire shape) ─────────────
  // Buffered async-iterator exo: the remote object pulls frames with
  // E(reader).next(); the mic callback pushes them.
  //
  // Each pull is a CapTP round trip. The mic produces frames faster than a round
  // trip completes, so if every next() returned one frame the unpulled audio
  // would back up unboundedly and arrive at the recognizer later and later —
  // partials would lag further behind the longer you talk, then flush on stop.
  // Instead, next() coalesces all PCM buffered since the last pull into one
  // frame, so a slow pull catches up in a single round trip (and we don't flood
  // CapTP with per-frame messages competing with the text stream).
  const makeAudioChannel = () => {
    /** @type {Uint8Array[]} */
    let pcmChunks = [];
    /** @type {any} */
    let terminal = null; // queued { type: 'end' } | { type: 'abort', reason }
    let finished = false;
    /** @type {((value?: unknown) => void) | null} */
    let wake = null;

    const wakeUp = () => {
      if (wake) {
        const w = wake;
        wake = null;
        w();
      }
    };

    const reader = Far('StreamReader', {
      next: async () => {
        for (;;) {
          if (pcmChunks.length) {
            const chunks = pcmChunks;
            pcmChunks = [];
            let total = 0;
            for (const c of chunks) total += c.length;
            const merged = new Uint8Array(total);
            let offset = 0;
            for (const c of chunks) {
              merged.set(c, offset);
              offset += c.length;
            }
            return harden({
              value: harden({ type: 'bytes', b64: bytesToBase64(merged) }),
              done: false,
            });
          }
          if (terminal) {
            const value = terminal;
            terminal = null;
            finished = true;
            return harden({ value, done: false });
          }
          if (finished) return harden({ value: undefined, done: true });
          // eslint-disable-next-line no-await-in-loop
          await new Promise(resolve => {
            wake = resolve;
          });
        }
      },
      return: async () => {
        finished = true;
        pcmChunks = [];
        terminal = null;
        wakeUp();
        return harden({ value: undefined, done: true });
      },
      throw: async (/** @type {any} */ error) => {
        finished = true;
        pcmChunks = [];
        terminal = null;
        wakeUp();
        throw error;
      },
    });

    return {
      reader,
      writeBytes: (/** @type {Uint8Array} */ pcm) => {
        if (finished || terminal) return;
        pcmChunks.push(pcm);
        wakeUp();
      },
      end: () => {
        if (finished || terminal) return;
        terminal = harden({ type: 'end' });
        wakeUp();
      },
      abort: (/** @type {string} */ reason) => {
        if (finished || terminal) return;
        terminal = harden({ type: 'abort', reason });
        wakeUp();
      },
    };
  };

  // Average-decimate Float32 [-1,1] samples from inRate to outRate, returning
  // little-endian s16le PCM bytes.
  const toPcm16le = (
    /** @type {Float32Array} */ input,
    /** @type {number} */ inRate,
    /** @type {number} */ outRate,
  ) => {
    const ratio = inRate / outRate;
    const outLen = Math.floor(input.length / ratio);
    const bytes = new Uint8Array(outLen * 2);
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < outLen; i += 1) {
      const start = Math.floor(i * ratio);
      const end = Math.min(input.length, Math.floor((i + 1) * ratio));
      let sum = 0;
      for (let j = start; j < end; j += 1) sum += input[j];
      const sample = end > start ? sum / (end - start) : 0;
      const clamped = Math.max(-1, Math.min(1, sample));
      view.setInt16(i * 2, clamped < 0 ? clamped * 32_768 : clamped * 32_767, true);
    }
    return bytes;
  };

  const bytesToBase64 = (/** @type {Uint8Array} */ bytes) => {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(
        null,
        /** @type {any} */ (bytes.subarray(i, i + chunk)),
      );
    }
    return btoa(binary);
  };

  // ── Recording lifecycle ─────────────────────────────────────────────────────
  let cancelled = false;
  let recording = false;
  /** @type {MediaStream | null} */
  let mediaStream = null;
  /** @type {AudioContext | null} */
  let audioCtx = null;
  /** @type {MediaStreamAudioSourceNode | null} */
  let source = null;
  /** @type {ScriptProcessorNode | null} */
  let processor = null;
  /** @type {ReturnType<typeof makeAudioChannel> | null} */
  let channel = null;

  const drainText = async (/** @type {any} */ textReader) => {
    try {
      for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const { value, done } = await E(textReader).next();
        if (done || cancelled) break;
        if (value.type === 'partial') {
          renderFromFull(value.text, false);
        } else if (value.type === 'final') {
          renderFromFull(value.text, true);
        } else if (value.type === 'phase') {
          setStatus(value.phase);
        } else if (value.type === 'end') {
          setStatus('done');
        } else if (value.type === 'abort') {
          setStatus(`error: ${value.reason}`);
        }
      }
    } catch (err) {
      setStatus(`error: ${/** @type {Error} */ (err).message}`);
    }
  };

  const start = async () => {
    if (recording) return;
    recording = true;
    lines = [];
    currentText = '';
    renderTranscript();
    setStatus('starting microphone…');
    $record.classList.add('recording');
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioCtx = new AudioContext();
      source = audioCtx.createMediaStreamSource(mediaStream);
      processor = audioCtx.createScriptProcessor(4096, 1, 1);
      channel = makeAudioChannel();

      const textReader = E(audioServer).transcribe(channel.reader);
      drainText(textReader);

      const inRate = audioCtx.sampleRate;
      processor.onaudioprocess = e => {
        if (!channel) return;
        const input = e.inputBuffer.getChannelData(0);
        const pcm = toPcm16le(input, inRate, 16000);
        if (pcm.length) channel.writeBytes(pcm);
      };
      source.connect(processor);
      processor.connect(audioCtx.destination);
      setStatus('listening…');
    } catch (err) {
      recording = false;
      $record.classList.remove('recording');
      setStatus(`mic error: ${/** @type {Error} */ (err).message}`);
    }
  };

  const stop = () => {
    if (!recording) return;
    recording = false;
    $record.classList.remove('recording');
    if (processor) processor.onaudioprocess = null;
    try {
      source?.disconnect();
      processor?.disconnect();
    } catch {
      // already disconnected
    }
    mediaStream?.getTracks().forEach(t => t.stop());
    audioCtx?.close();
    channel?.end();
    source = null;
    processor = null;
    mediaStream = null;
    audioCtx = null;
  };

  // Toggle: click once to start recording, click again to stop.
  $record.addEventListener('click', () => {
    if (recording) stop();
    else start();
  });

  return () => {
    cancelled = true;
    stop();
  };
};
harden(voiceComponent);
