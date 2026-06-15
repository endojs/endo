// @ts-check

import { E, Far } from '@endo/far';
import harden from '@endo/harden';

/**
 * Floot Chat Space. Resolves a Floot streaming-agent driver from the
 * profilePath (the `*-driver` caplet created by @endo/floot's factory — see
 * packages/floot in the endo4 fork) and holds a typed conversation with it,
 * rendering the reply token-by-token in the centred, rising-line aesthetic of
 * the Voice Space.
 *
 * The driver's interface is `converse(input) -> replyReader`, where replyReader
 * is an async-iterator exo yielding the floot reply wire shape (append deltas,
 * unlike the transcript wire which replaces):
 *   { type: 'phase', phase } | { type: 'delta', text } | { type: 'final', text }
 *   | { type: 'end' } | { type: 'abort', reason }
 *
 * When `audioPath` is given, it resolves an audio/transcription object the same
 * way the Voice Space does and shows a mic button: speech is captured as 16 kHz
 * mono PCM, streamed to `transcribe(audioReader) -> textReader`, and the
 * transcript fills the compose box live (replace semantics); when the transcript
 * stream ends, the assembled message is sent to the agent.
 *
 * @param {HTMLElement} $parent
 * @param {unknown} rootPowers
 * @param {string[]} profilePath
 * @param {(newPath: string[]) => void} _onProfileChange
 * @param {string[]} [audioPath] - pet-name path to an audio/transcription object
 * @returns {() => void} cleanup function
 */
export const flootComponent = (
  $parent,
  rootPowers,
  profilePath,
  _onProfileChange,
  audioPath,
) => {
  $parent.innerHTML = '';

  // Resolve the floot driver by walking the profile path, exactly like the
  // Voice Space resolves its audio object.
  /** @type {any} */
  let flootAgent = rootPowers;
  for (const name of profilePath) {
    flootAgent = E(/** @type {any} */ (flootAgent)).lookup(name);
  }

  // Optionally resolve an audio object for mic input, the same way.
  const hasMic = Boolean(audioPath && audioPath.length);
  /** @type {any} */
  let audioServer = null;
  if (hasMic) {
    audioServer = rootPowers;
    for (const name of /** @type {string[]} */ (audioPath)) {
      audioServer = E(/** @type {any} */ (audioServer)).lookup(name);
    }
  }

  // ── UI ────────────────────────────────────────────────────────────────────
  // Conversation lines stack bottom-up in the centre: the freshest line sits
  // just above the compose box, older lines rise and fade into a gradient at the
  // top. User turns are tinted; the agent's streaming reply is the bright line.
  const $root = document.createElement('div');
  $root.className = 'floot-space';
  $root.innerHTML = `
    <style>
      .floot-space { position: relative; height: 100%; box-sizing: border-box;
        display: flex; flex-direction: column; overflow: hidden; }
      .floot-status { position: absolute; top: 0.75rem; left: 0; right: 0;
        text-align: center; font-size: 0.8rem; opacity: 0.5; pointer-events: none; }
      .floot-stage { flex: 1; min-height: 0; display: flex; flex-direction: column;
        justify-content: flex-end; align-items: center; text-align: center;
        gap: 0.55rem; padding: 2.5rem 1.5rem 7rem; box-sizing: border-box;
        overflow: hidden;
        -webkit-mask-image: linear-gradient(to bottom, transparent 0%,
          rgba(0,0,0,0.12) 16%, #000 42%);
        mask-image: linear-gradient(to bottom, transparent 0%,
          rgba(0,0,0,0.12) 16%, #000 42%); }
      .floot-line { font-size: 1.5rem; line-height: 1.4; max-width: 36rem;
        opacity: 0.85; transition: opacity 0.4s ease; }
      .floot-line.assistant.current { opacity: 1; font-weight: 500; }
      .floot-line.user { font-size: 1.1rem; opacity: 0.6;
        color: #e0245e; font-weight: 500; }
      .floot-compose { position: absolute; bottom: 1.25rem; left: 50%;
        transform: translateX(-50%); width: min(36rem, calc(100% - 2.5rem));
        display: flex; gap: 0.5rem; align-items: flex-end; }
      .floot-input { flex: 1; resize: none; font: inherit; font-size: 1rem;
        line-height: 1.4; padding: 0.7rem 0.9rem; border-radius: 1.1rem;
        border: 1px solid rgba(128,128,128,0.35); background: rgba(128,128,128,0.08);
        color: inherit; max-height: 8rem; outline: none; }
      .floot-input:focus { border-color: #e0245e; }
      .floot-send { flex: none; width: 44px; height: 44px; border-radius: 50%;
        border: none; background: #e0245e; color: #fff; font-size: 1.1rem;
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        transition: transform 0.15s ease, opacity 0.15s ease; }
      .floot-send:hover { transform: scale(1.07); }
      .floot-send:disabled { opacity: 0.5; cursor: default; transform: none; }
      .floot-mic { flex: none; width: 44px; height: 44px; border-radius: 50%;
        border: 1px solid rgba(128,128,128,0.35); background: rgba(128,128,128,0.08);
        color: inherit; font-size: 1.1rem; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: transform 0.15s ease, background 0.15s ease; }
      .floot-mic:hover { transform: scale(1.07); }
      .floot-mic.recording { background: #e0245e; color: #fff; border-color: #e0245e;
        animation: floot-mic-pulse 1.4s ease-in-out infinite; }
      @keyframes floot-mic-pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(224,36,94,0.4); }
        50% { box-shadow: 0 0 0 7px rgba(224,36,94,0); } }
    </style>
    <div class="floot-status" id="floot-status">Ready.</div>
    <div class="floot-stage" id="floot-stage"></div>
    <div class="floot-compose">
      ${
        hasMic
          ? `<button type="button" class="floot-mic" id="floot-mic"
        aria-label="Speak">🎙</button>`
          : ''
      }
      <textarea class="floot-input" id="floot-input" rows="1"
        placeholder="Message Floot…" aria-label="Message"></textarea>
      <button type="button" class="floot-send" id="floot-send"
        aria-label="Send">↑</button>
    </div>
  `;
  $parent.appendChild($root);

  const $status = /** @type {HTMLElement} */ (
    $root.querySelector('#floot-status')
  );
  const $stage = /** @type {HTMLElement} */ ($root.querySelector('#floot-stage'));
  const $input = /** @type {HTMLTextAreaElement} */ (
    $root.querySelector('#floot-input')
  );
  const $send = /** @type {HTMLButtonElement} */ (
    $root.querySelector('#floot-send')
  );
  const $mic = /** @type {HTMLButtonElement | null} */ (
    $root.querySelector('#floot-mic')
  );

  // Finished turns plus the in-progress assistant reply.
  /** @type {{ role: 'user' | 'assistant', text: string }[]} */
  const committed = [];
  let streaming = '';

  const setStatus = (/** @type {string} */ s) => {
    $status.textContent = s;
  };

  // Sentences ending in . ! ? … (plus any closing quote/bracket) followed by
  // whitespace become their own line; the trailing fragment is the last line.
  const SENTENCE_BOUNDARY = /[.!?…]+["'”’)\]]*(?=\s)/;
  const splitSentences = (/** @type {string} */ full) => {
    /** @type {string[]} */
    const out = [];
    let rest = full;
    for (;;) {
      const m = SENTENCE_BOUNDARY.exec(rest);
      if (!m) break;
      const endIdx = m.index + m[0].length;
      const sentence = rest.slice(0, endIdx).trim();
      if (sentence) out.push(sentence);
      rest = rest.slice(endIdx).replace(/^\s+/, '');
    }
    const tail = rest.trim();
    if (tail) out.push(tail);
    return out;
  };

  const appendLine = (
    /** @type {string} */ text,
    /** @type {'user' | 'assistant'} */ role,
    /** @type {boolean} */ isCurrent,
  ) => {
    const $l = document.createElement('div');
    $l.className = `floot-line ${role}${isCurrent ? ' current' : ''}`;
    $l.textContent = text;
    $stage.appendChild($l);
  };

  const render = () => {
    $stage.innerHTML = '';
    for (const entry of committed) {
      if (entry.role === 'assistant') {
        for (const sentence of splitSentences(entry.text)) {
          appendLine(sentence, 'assistant', false);
        }
      } else {
        appendLine(entry.text, 'user', false);
      }
    }
    if (streaming) {
      const sentences = splitSentences(streaming);
      sentences.forEach((sentence, i) =>
        appendLine(sentence, 'assistant', i === sentences.length - 1),
      );
    }
  };

  // ── Conversation lifecycle ──────────────────────────────────────────────────
  let cancelled = false;
  let busy = false;

  const send = async () => {
    const text = $input.value.trim();
    if (!text || busy) return;
    busy = true;
    $send.disabled = true; // the button guards re-entry; the input stays enabled
    $input.value = '';
    $input.style.height = 'auto';
    committed.push({ role: 'user', text });
    streaming = '';
    render();
    setStatus('thinking…');

    try {
      const reader = E(flootAgent).converse(text);
      let full = '';
      for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const { value, done } = await E(reader).next();
        if (done || cancelled) break;
        if (value.type === 'delta') {
          full += value.text;
          streaming = full;
          render();
        } else if (value.type === 'final') {
          full = value.text;
          streaming = full;
          render();
        } else if (value.type === 'phase') {
          setStatus(value.phase);
        } else if (value.type === 'end') {
          if (full.trim()) committed.push({ role: 'assistant', text: full.trim() });
          streaming = '';
          render();
          setStatus('Ready.');
          break;
        } else if (value.type === 'abort') {
          streaming = '';
          render();
          setStatus(`error: ${value.reason}`);
          break;
        }
      }
    } catch (err) {
      streaming = '';
      render();
      setStatus(`error: ${/** @type {Error} */ (err).message}`);
    } finally {
      busy = false;
      $send.disabled = false;
    }
  };

  // Enter sends; Shift+Enter inserts a newline. The compose box is never
  // disabled while a reply streams — only the send button guards re-entry.
  $input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
  // Auto-grow the textarea up to its max-height.
  const autoGrow = () => {
    $input.style.height = 'auto';
    $input.style.height = `${$input.scrollHeight}px`;
  };
  $input.addEventListener('input', autoGrow);
  $send.addEventListener('click', () => send());

  // ── Mic input (optional) ────────────────────────────────────────────────────
  // Mirrors the Voice Space: capture mic PCM, stream it to the audio object's
  // transcribe(), and let the transcript (replace semantics) fill the compose
  // box live. On the transcript stream's end the assembled text is auto-sent.
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

  // Buffered async-iterator exo: the remote audio object pulls frames with
  // next(); the mic callback pushes them. Each next() coalesces all PCM buffered
  // since the last pull into one frame so a slow CapTP round trip catches up in
  // one message instead of letting audio back up unboundedly.
  function makeAudioChannel() {
    /** @type {Uint8Array[]} */
    let pcmChunks = [];
    /** @type {any} */
    let terminal = null;
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
    };
  }

  // Average-decimate Float32 [-1,1] samples from inRate to outRate as s16le PCM.
  function toPcm16le(
    /** @type {Float32Array} */ input,
    /** @type {number} */ inRate,
    /** @type {number} */ outRate,
  ) {
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
      view.setInt16(
        i * 2,
        clamped < 0 ? clamped * 32_768 : clamped * 32_767,
        true,
      );
    }
    return bytes;
  }

  function bytesToBase64(/** @type {Uint8Array} */ bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(
        null,
        /** @type {any} */ (bytes.subarray(i, i + chunk)),
      );
    }
    return btoa(binary);
  }

  const stopMic = () => {
    if (!recording) return;
    recording = false;
    $mic?.classList.remove('recording');
    if (processor) processor.onaudioprocess = null;
    try {
      source?.disconnect();
      processor?.disconnect();
    } catch {
      // already disconnected
    }
    mediaStream?.getTracks().forEach(t => t.stop());
    audioCtx?.close();
    channel?.end(); // flush: the recognizer emits final + end, then we send
    source = null;
    processor = null;
    mediaStream = null;
    audioCtx = null;
  };

  const drainTranscript = async (/** @type {any} */ textReader) => {
    try {
      for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const { value, done } = await E(textReader).next();
        if (done || cancelled) break;
        if (value.type === 'partial' || value.type === 'final') {
          // Replace semantics: each event carries the full transcript so far.
          $input.value = value.text;
          autoGrow();
        } else if (value.type === 'phase') {
          setStatus(value.phase);
        } else if (value.type === 'end') {
          setStatus('Ready.');
          if ($input.value.trim()) send();
          break;
        } else if (value.type === 'abort') {
          setStatus(`mic error: ${value.reason}`);
          break;
        }
      }
    } catch (err) {
      setStatus(`mic error: ${/** @type {Error} */ (err).message}`);
    }
  };

  const startMic = async () => {
    if (recording || !audioServer) return;
    recording = true;
    $mic?.classList.add('recording');
    $input.value = '';
    autoGrow();
    setStatus('starting microphone…');
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioCtx = new AudioContext();
      source = audioCtx.createMediaStreamSource(mediaStream);
      processor = audioCtx.createScriptProcessor(4096, 1, 1);
      channel = makeAudioChannel();

      const textReader = E(audioServer).transcribe(channel.reader);
      drainTranscript(textReader);

      const inRate = audioCtx.sampleRate;
      processor.onaudioprocess = e => {
        if (!channel) return;
        const input = e.inputBuffer.getChannelData(0);
        const pcm = toPcm16le(input, inRate, 16_000);
        if (pcm.length) channel.writeBytes(pcm);
      };
      source.connect(processor);
      processor.connect(audioCtx.destination);
      setStatus('listening…');
    } catch (err) {
      recording = false;
      $mic?.classList.remove('recording');
      setStatus(`mic error: ${/** @type {Error} */ (err).message}`);
    }
  };

  // Toggle: click to start listening, click again to stop and send.
  $mic?.addEventListener('click', () => {
    if (recording) stopMic();
    else startMic();
  });

  $input.focus();

  return () => {
    cancelled = true;
    stopMic();
  };
};
harden(flootComponent);
