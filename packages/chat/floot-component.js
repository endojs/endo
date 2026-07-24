// @ts-check

import { E } from '@endo/eventual-send';
import { Far } from '@endo/pass-style';
import harden from '@endo/harden';
import { makeBufferedReader } from '@endo/exo-stream/buffered-channel.js';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';

import { FlootApp } from '@endo/space-floot';
import { h, renderConfined, unmount } from './setup-preact-container.js';

// The view's controller/state/message shapes are defined (and enforced at the
// `h(FlootApp, …)` boundary) by `@endo/space-floot`'s own types; like the other
// migrated space wrappers (e.g. peers-component.js) the host does not re-import
// them.

// ── Background turns ─────────────────────────────────────────────────────────
// A Floot turn keeps running on the daemon even after you leave its space: the
// reply reader is consumed by a background loop kept HERE, outside any component
// instance, so unmounting a Floot space never returns the reader (which would
// abort the agent) — the turn finishes and persists in the background. Keeping
// the loop module-level also lets a remounted component reattach to a still-
// streaming reply and show a "thinking" indicator. The entry is removed once the
// turn ends, so a finished reply simply falls back to getHistory().
/**
 * @typedef {{ role: 'assistant' | 'tool', text?: string, id?: string,
 *   name?: string, args?: string, result?: string | null }} TurnMessage
 * @typedef {{
 *   sessionId: string,
 *   messages: TurnMessage[],
 *   streamingText: string,
 *   phase: string,
 *   done: boolean,
 *   error: string | null,
 *   usage: { inputTokens: number, outputTokens: number, turns: number } | null,
 *   whenDone: Promise<void>,
 *   subscribe: (fn: (ev: { type: string }) => void) => () => void,
 *   stop: () => void,
 * }} FlootTurn
 */
/** @type {Map<string, FlootTurn>} */
const inFlightTurns = new Map();

/**
 * Consume a reply reader in the background, accumulating renderable turn state
 * and notifying subscribers as events arrive. Survives component unmount.
 *
 * @param {string} key registry key (factory path + session id)
 * @param {string} sessionId
 * @param {any} reader the reply reader returned by session.converse()
 * @returns {FlootTurn}
 */
const startFlootTurn = (key, sessionId, reader) => {
  // Stream the reply over the exo-stream protocol rather than one CapTP round
  // trip per event. `buffer` primes the synchronize chain; the responder is a
  // buffered channel, so it acknowledges eagerly regardless — the pre-resolved
  // nodes only save the first round trip.
  const replies = iterateReader(reader, { buffer: 8 });
  /** @type {Set<(ev: { type: string }) => void>} */
  const listeners = new Set();
  /** @type {TurnMessage[]} */
  const messages = [];
  // Tool calls in one batch run concurrently, so results arrive out of order —
  // track each pending call by its id and pair its result back by id.
  /** @type {Map<string, TurnMessage>} */
  const pendingTools = new Map();
  let stopped = false;
  /** @type {() => void} */
  let resolveDone = () => {};
  /** @type {Promise<void>} */
  const whenDone = new Promise(resolve => {
    resolveDone = resolve;
  });

  /** @param {{ type: string }} ev */
  const emit = ev => {
    for (const fn of [...listeners]) {
      try {
        fn(ev);
      } catch {
        // a view error must not stall the background loop
      }
    }
  };

  /** @type {FlootTurn} */
  const turn = {
    sessionId,
    messages,
    streamingText: '',
    phase: 'thinking',
    done: false,
    error: null,
    usage: null,
    whenDone,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      // Closing the stream fires the producer's onClose, which aborts the
      // in-flight agent turn (stops token generation and tool rounds).
      replies.return().catch(() => {});
    },
  };
  inFlightTurns.set(key, turn);

  (async () => {
    try {
      for await (const raw of replies) {
        const value = /** @type {any} */ (raw);
        if (stopped) break;
        if (value.type === 'delta') {
          turn.streamingText += value.text;
          emit({ type: 'delta' });
        } else if (value.type === 'final') {
          turn.streamingText = value.text;
          emit({ type: 'final' });
        } else if (value.type === 'tool_call') {
          if (turn.streamingText.trim()) {
            messages.push({
              role: 'assistant',
              text: turn.streamingText.trim(),
            });
          }
          turn.streamingText = '';
          const toolMsg = {
            role: /** @type {const} */ ('tool'),
            id: value.id,
            name: value.name,
            args: value.args,
            result: /** @type {string | null} */ (null),
          };
          pendingTools.set(value.id, toolMsg);
          messages.push(toolMsg);
          emit({ type: 'tool_call' });
        } else if (value.type === 'tool_result') {
          const toolMsg = pendingTools.get(value.id);
          if (toolMsg) {
            toolMsg.result = value.result;
            pendingTools.delete(value.id);
          }
          emit({ type: 'tool_result' });
        } else if (value.type === 'phase') {
          turn.phase = value.phase;
          emit({ type: 'phase' });
        } else if (value.type === 'usage') {
          turn.usage = {
            inputTokens: value.inputTokens,
            outputTokens: value.outputTokens,
            turns: value.turns,
          };
          emit({ type: 'usage' });
        } else if (value.type === 'end') {
          break;
        } else if (value.type === 'abort') {
          turn.error = value.reason;
          emit({ type: 'abort' });
          break;
        }
      }
      if (turn.streamingText.trim()) {
        messages.push({ role: 'assistant', text: turn.streamingText.trim() });
        turn.streamingText = '';
      }
    } catch (err) {
      turn.error = /** @type {Error} */ (err)?.message || String(err);
      emit({ type: 'abort' });
    } finally {
      turn.done = true;
      inFlightTurns.delete(key);
      emit({ type: 'done' });
      resolveDone();
    }
  })();

  return turn;
};

// ── PCM / base64 helpers (pure; host-side) ───────────────────────────────────

// Average-decimate Float32 [-1,1] samples from inRate to outRate as s16le PCM.
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
    view.setInt16(
      i * 2,
      clamped < 0 ? clamped * 32_768 : clamped * 32_767,
      true,
    );
  }
  return bytes;
};
harden(toPcm16le);

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
harden(bytesToBase64);

const base64ToBytes = (/** @type {string} */ b64) => {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};
harden(base64ToBytes);

// Buffered async-iterator exo: the remote audio object pulls frames with
// next(); the mic callback pushes them. Each next() coalesces all PCM buffered
// since the last pull into one frame so a slow CapTP round trip catches up in
// one message instead of letting audio back up unboundedly.
const makeAudioChannel = () => {
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

  return harden({
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
  });
};
harden(makeAudioChannel);

// A text feed the chat pushes reply text into: streaming reply
// deltas while a turn runs, or a finished message's full text for replay. The
// remote TTS object consumes the deltas and returns an audio stream.
// Wire (APPEND deltas): { type:'delta', text } | { type:'end' } | { type:'abort' }
const makeTextFeed = () => {
  const { push, reader, isClosed } = makeBufferedReader();
  return harden({
    reader,
    delta: (/** @type {string} */ text) => push({ type: 'delta', text }),
    end: () => push({ type: 'end' }),
    abort: () => push({ type: 'abort', reason: 'cancelled' }),
    isClosed,
  });
};
harden(makeTextFeed);

// Continuous, hands-free listening with noise-floor voice-activity detection
// (ported from the Floot Native web UI's useVAD). The mic stays open; an
// AnalyserNode tracks RMS volume. After a 1s calibration we learn the room's
// noise floor and derive a speech threshold; crossing it starts an utterance
// (a fresh transcribe() stream), and trailing silence ends it and auto-sends.
const VAD = harden({
  CALIBRATION_MS: 1000,
  // Silence that ends an utterance. This is now a *tentative* end: the text is
  // buffered, not sent, until RESUME_GRACE_MS more passes without speech.
  SILENCE_MS: 1200,
  // After a tentative end, wait this long for the user to resume a pause-heavy
  // thought before sending. Resumed speech is appended, so an intra-thought
  // pause no longer kicks off a reply mid-sentence and drops the rest.
  RESUME_GRACE_MS: 800,
  MIN_SPEECH_MS: 400,
  PREROLL_FRAMES: 6, // ~0.5s of buffered audio prepended so onsets aren't clipped
  EMA_ALPHA: 0.01,
  THRESHOLD_MULT: 2.5,
  BARGE_MULT: 3,
  // Extra barge headroom required while our own TTS is audibly playing. The
  // phone speaker leaks the bot's voice back into the mic past browser echo
  // cancellation; without this the bot barges in on itself.
  ECHO_BARGE_MULT: 2,
  MIN_THRESHOLD: 0.01,
  MIN_BARGE: 0.05,
  DISPLAY_FULL_SCALE: 0.1,
});

// Transcripts the recognizer commonly hallucinates from silence/noise; drop
// them so a stray blip doesn't auto-send a junk turn.
const JUNK_PHRASES = harden(
  new Set([
    'thank you',
    'thanks for watching',
    'thank you for watching',
    'thanks',
    'you',
    'bye',
    'okay',
    'ok',
    'um',
    'uh',
    '.',
    '',
  ]),
);

const DEFAULT_TITLE = 'New chat';
const DEFAULT_PRESET_ID = 'general';

/**
 * Floot Chat Space, host wrapper. Resolves a Floot factory from the
 * profilePath (the `floot-factory` caplet created by @endo/floot) and holds
 * typed conversations with it, then mounts the PURE confined Preact view
 * (`@endo/space-floot`'s `FlootApp`) through chat's sanitizing
 * `renderConfined`.
 *
 * This wrapper owns everything the confined view cannot touch: the CapTP
 * resolution, the module-level background-turn registry, mic capture + Web
 * Audio + the VAD loop, and TTS playback. It exposes all of that to the view
 * only as a `controller` — pure-data `getState()` snapshots plus callbacks.
 * No DOM node, audio handle, `MediaStream`, or capability ever crosses into
 * the view (see packages/space-floot/DESIGN.md).
 *
 * The factory owns every session; the UI never sees the backing guests. Its
 * interface is `createSession(title?, presetId?, model?) -> facet`,
 * `listSessions() -> [{id,title,createdAt,presetId,model}]`, `getSession(id) ->
 * facet`, `renameSession(id,title)`, `deleteSession(id)`, `listPresets()`,
 * `listModels() -> [{id,title,description,default}]`. A session facet exposes
 * `converse(input) -> replyReader`, `getHistory()`, `getInfo()`, and
 * `getUsage()`.
 *
 * When `audioPath` is given, it resolves a speech-to-text object and enables a
 * mic: speech is captured as 16 kHz mono PCM, streamed to
 * `transcribe(audioReader) -> textReader`, and the transcript fills the compose
 * box live; on end the assembled message is sent. When `ttsPath` is given, it
 * resolves a text-to-speech object: reply deltas are streamed to
 * `synthesize(textReader) -> audioReader` (raw s16le mono PCM, one event per
 * sentence) and played back via Web Audio as they arrive.
 *
 * @param {HTMLElement} $parent
 * @param {unknown} rootPowers
 * @param {string[]} profilePath
 * @param {(newPath: string[]) => void} _onProfileChange
 * @param {string[]} [audioPath] - pet-name path to a speech-to-text object
 * @param {string[]} [ttsPath] - pet-name path to a text-to-speech object
 * @returns {() => void} cleanup function
 */
export const flootComponent = (
  $parent,
  rootPowers,
  profilePath,
  _onProfileChange,
  audioPath,
  ttsPath,
) => {
  // Resolve the floot factory by walking the profile path.
  /** @type {any} */
  let factory = rootPowers;
  for (const name of profilePath) {
    factory = E(/** @type {any} */ (factory)).lookup(name);
  }

  // Optionally resolve a speech-to-text object for mic input, the same way.
  const hasMic = Boolean(audioPath && audioPath.length);
  /** @type {any} */
  let audioServer = null;
  if (hasMic) {
    audioServer = rootPowers;
    for (const name of /** @type {string[]} */ (audioPath)) {
      audioServer = E(/** @type {any} */ (audioServer)).lookup(name);
    }
  }

  // Optionally resolve a text-to-speech object for spoken replies, the same way.
  const hasTts = Boolean(ttsPath && ttsPath.length);
  /** @type {any} */
  let ttsServer = null;
  if (hasTts) {
    ttsServer = rootPowers;
    for (const name of /** @type {string[]} */ (ttsPath)) {
      ttsServer = E(/** @type {any} */ (ttsServer)).lookup(name);
    }
  }
  // Spoken replies on by default when a TTS object is wired; toggled by the
  // speaker button. Replay buttons work regardless of this live-speech setting.
  let ttsEnabled = hasTts;

  // ── View-model state (read by getState, mutated by the host engine) ─────────
  /**
   * @typedef {{ role: 'user' | 'assistant', text?: string,
   *   meta?: { mail?: { from?: string } },
   *   name?: string, args?: string, result?: string | null }} HistoryMessage
   * @typedef {{ id: string, title: string, createdAt: number, presetId: string,
   *   model: string, messages: HistoryMessage[], facet: any, loaded: boolean }}
   *   FlootSession
   * @typedef {{ id: string, title: string, description: string }} FlootPreset
   * @typedef {{ id: string, title: string, description: string,
   *   default: boolean }} FlootModel
   */

  /** @type {FlootPreset[]} */
  let presets = [];
  /** @type {FlootModel[]} */
  let models = [];
  /** @type {FlootSession[]} */
  let sessions = [];
  /** @type {string | null} */
  let activeSessionId = null;
  /** @type {Map<string, 'idle' | 'streaming' | 'error'>} */
  const sessionStatus = new Map();

  let status = 'Loading sessions…';
  let inputText = '';
  let settingsOpen = false;
  // Whether the transcript should follow new content to the bottom. Tracked
  // host-side (see the scroll observer at mount) because the confined view
  // cannot touch DOM scroll positions.
  let stick = true;
  /** @type {{ inputTokens: number, outputTokens: number } | null} */
  let usage = null;

  // Voice/meter state (pure data — no audio objects).
  let voiceTranscript = '';
  let replayingText = '';
  let meterVol = 0;
  let meterNoise = 0;
  let meterThreshold = VAD.MIN_THRESHOLD;

  // ── Subscription / snapshot plumbing ────────────────────────────────────────
  /** @type {Set<() => void>} */
  const listeners = new Set();
  const notify = () => {
    for (const fn of [...listeners]) {
      try {
        fn();
      } catch {
        // a view error must not stall the engine
      }
    }
  };
  const setStatus = (/** @type {string} */ s) => {
    status = s;
    notify();
  };

  const getActiveSession = () =>
    sessions.find(s => s.id === activeSessionId) || null;

  const autoTitle = (/** @type {string} */ text) => {
    const trimmed = text.trim().replace(/\s+/g, ' ');
    if (!trimmed) return DEFAULT_TITLE;
    return trimmed.length > 60 ? `${trimmed.slice(0, 60)}…` : trimmed;
  };

  // Resolve (and cache) the session facet for a session.
  const facetFor = (/** @type {FlootSession} */ session) => {
    if (!session.facet) session.facet = E(factory).getSession(session.id);
    return session.facet;
  };

  // Registry key for a session's background turn. Scoped by the factory path so
  // two Floot spaces pointing at different factories can't collide on a shared
  // session id.
  const turnKey = (/** @type {string} */ id) =>
    `${profilePath.join(' ')} ${id}`;
  const liveTurnFor = (/** @type {string} */ id) => {
    const turn = inFlightTurns.get(turnKey(id));
    return turn && !turn.done ? turn : null;
  };

  // Pull the spoken transcript for a session from its guest into the cache.
  const loadHistory = async (/** @type {FlootSession} */ session) => {
    try {
      const history = await E(facetFor(session)).getHistory();
      session.messages = history.map((/** @type {any} */ m) =>
        m.role === 'tool'
          ? { role: 'tool', name: m.name, args: m.args, result: m.result }
          : {
              role: m.role === 'user' ? 'user' : 'assistant',
              text: m.content,
              ...(m.meta ? { meta: m.meta } : {}),
            },
      );
    } catch {
      // leave whatever we have; history just won't repaint
    }
    session.loaded = true;
  };

  // Create a new session on the factory and prepend it to the local list.
  /**
   * @param {string} [title]
   * @param {string} [presetId]
   * @param {string} [model]
   */
  const createSession = async (title, presetId, model) => {
    const facet = await E(factory).createSession(
      title || DEFAULT_TITLE,
      presetId,
      model,
    );
    const info = await E(facet).getInfo();
    /** @type {FlootSession} */
    const session = {
      id: info.id,
      title: info.title || DEFAULT_TITLE,
      createdAt: info.createdAt || Date.now(),
      presetId: info.presetId || DEFAULT_PRESET_ID,
      model: info.model || '',
      messages: [],
      facet,
      loaded: true,
    };
    sessions.unshift(session);
    activeSessionId = session.id;
    return session;
  };

  // Pull a session's cumulative usage from its guest and show it (cost survives
  // restarts; a live turn updates it again via the 'usage' reply event).
  const showSessionTokens = (/** @type {FlootSession | null} */ session) => {
    usage = null;
    notify();
    if (!session) return;
    E(facetFor(session))
      .getUsage()
      .then((/** @type {any} */ u) => {
        if (activeSessionId === session.id) {
          usage = u;
          notify();
        }
      })
      .catch(() => {});
  };

  // ── Snapshot ────────────────────────────────────────────────────────────────
  const PCT = (/** @type {number} */ v) =>
    Math.min(100, (v / VAD.DISPLAY_FULL_SCALE) * 100);

  /** @param {HistoryMessage | TurnMessage} m */
  const toViewMessage = m =>
    m.role === 'tool'
      ? {
          role: /** @type {const} */ ('tool'),
          id: /** @type {any} */ (m).id,
          name: m.name,
          args: m.args,
          result: m.result == null ? null : m.result,
        }
      : {
          role: /** @type {'user' | 'assistant'} */ (m.role),
          text: m.text || '',
          .../** @type {any} */ (
            /** @type {{ meta?: unknown }} */ (m).meta
              ? { meta: /** @type {{ meta?: unknown }} */ (m).meta }
              : {}
          ),
        };

  const getState = () => {
    const session = getActiveSession();
    const liveTurn = session ? liveTurnFor(session.id) : null;
    const base = session ? session.messages : [];
    const allMessages = liveTurn ? [...base, ...liveTurn.messages] : base;
    return harden({
      sessions: sessions.map(s => ({
        id: s.id,
        title: s.title,
        createdAt: s.createdAt,
        presetId: s.presetId,
        model: s.model,
        status: liveTurnFor(s.id)
          ? /** @type {const} */ ('streaming')
          : sessionStatus.get(s.id) || 'idle',
        messageCount: s.messages.length,
        loaded: s.loaded,
      })),
      activeSessionId,
      presets: presets.map(p => ({
        id: p.id,
        title: p.title,
        description: p.description,
      })),
      models: models.map(m => ({
        id: m.id,
        title: m.title,
        description: m.description,
        default: m.default,
      })),
      messages: allMessages.map(toViewMessage),
      streamingText: liveTurn ? liveTurn.streamingText : '',
      phase: liveTurn ? liveTurn.phase : '',
      busy: Boolean(liveTurn),
      loaded: session ? session.loaded : false,
      status,
      input: inputText,
      settingsOpen,
      usage: usage
        ? { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }
        : null,
      voice: {
        hasMic,
        hasTts,
        micActive,
        speaking,
        ttsEnabled,
        ttsSpeaking,
        meterPct: PCT(meterVol),
        noisePct: PCT(meterNoise),
        thresholdPct: PCT(meterThreshold),
        transcript: voiceTranscript,
        replayingText,
      },
      objects: {
        controller: profilePath.join('/'),
        stt: hasMic ? /** @type {string[]} */ (audioPath).join('/') : undefined,
        tts: hasTts ? /** @type {string[]} */ (ttsPath).join('/') : undefined,
      },
    });
  };

  // ── Conversation lifecycle ──────────────────────────────────────────────────
  let cancelled = false;
  let busy = false;
  let turnCancelled = false;
  /** @type {FlootTurn | null} */
  let activeTurn = null;
  /** @type {(() => void) | null} */
  let unsubscribeTurn = null;
  // Detaches this component's view from the active turn without stopping it
  // (used on unmount so the turn keeps running in the background).
  /** @type {(() => void) | null} */
  let detachActiveTurnView = null;

  /** @type {Promise<void>} */
  let submitChain = Promise.resolve();
  /** @type {Promise<void> | null} */
  let turnPromise = null;

  // The text feed driving live spoken replies for the current turn (null when
  // TTS is off or idle). Aborting it ends synthesis; stopTts() halts playback.
  /** @type {ReturnType<typeof makeTextFeed> | null} */
  let turnTtsFeed = null;

  // Cancel the in-flight turn (Stop button or voice barge-in). Returns a promise
  // that resolves once the turn has fully unwound.
  const cancelTurn = () => {
    if (!busy) return Promise.resolve();
    turnCancelled = true;
    // Stop button: explicitly tear the turn down (unlike leaving the space,
    // which lets it keep running in the background).
    if (activeTurn) activeTurn.stop();
    if (turnTtsFeed) turnTtsFeed.abort();
    stopTts(); // also silences any spoken reply in progress
    return turnPromise || Promise.resolve();
  };

  // Voice barge-in: the user started speaking over a live reply. Unlike the Stop
  // button's hard cancel, don't abort the turn — just silence its spoken reply
  // and let it finish in the background (and in history). The user's interjection
  // is queued after it (submitChain waits on the running turn).
  const softBargeIn = () => {
    if (!busy) return;
    if (turnTtsFeed) {
      turnTtsFeed.abort();
      turnTtsFeed = null;
    }
    stopTts();
    setStatus('continuing in background…');
  };

  // Attach this component's view to a background turn — the one it just started,
  // or one still running after a remount. Notifies the view as the turn's events
  // arrive and resolves when the turn ends. Detaching (on unmount) leaves the
  // turn running.
  /**
   * @param {FlootTurn} turn
   * @param {FlootSession} session
   * @param {boolean} [speakLive] feed reply deltas to TTS
   * @returns {Promise<void>}
   */
  const attachTurnView = (turn, session, speakLive = false) => {
    busy = true;
    turnCancelled = false;
    activeTurn = turn;
    sessionStatus.delete(session.id);
    // On reattach the bubble already shows what streamed before; only speak text
    // that arrives from here on.
    let lastSpoken = turn.streamingText.length;
    setStatus(`${turn.phase || 'thinking'}…`);
    if (turn.usage) usage = turn.usage;
    notify();

    return new Promise(resolve => {
      const detach = () => {
        if (unsubscribeTurn) {
          unsubscribeTurn();
          unsubscribeTurn = null;
        }
        detachActiveTurnView = null;
        if (activeTurn === turn) activeTurn = null;
        busy = false;
        notify();
        resolve();
      };
      detachActiveTurnView = detach;

      /** @param {{ type: string }} ev */
      const onEvent = ev => {
        // Ignore events for a session we're no longer viewing (defensive; the
        // busy guard normally blocks switching mid-turn).
        if (activeSessionId !== turn.sessionId) return;
        if (ev.type === 'delta' || ev.type === 'final') {
          if (
            speakLive &&
            turnTtsFeed &&
            turn.streamingText.length > lastSpoken
          ) {
            turnTtsFeed.delta(turn.streamingText.slice(lastSpoken));
            lastSpoken = turn.streamingText.length;
          }
          notify();
        } else if (ev.type === 'tool_call') {
          lastSpoken = 0;
          notify();
        } else if (ev.type === 'tool_result') {
          notify();
        } else if (ev.type === 'phase') {
          setStatus(`${turn.phase}…`);
        } else if (ev.type === 'usage') {
          usage = turn.usage;
          notify();
        } else if (ev.type === 'abort') {
          sessionStatus.set(turn.sessionId, 'error');
          notify();
        } else if (ev.type === 'done') {
          const stopped = turnCancelled;
          if (turnTtsFeed) {
            if (turn.error) turnTtsFeed.abort();
            else turnTtsFeed.end();
            turnTtsFeed = null;
          }
          if (turn.error) {
            sessionStatus.set(turn.sessionId, 'error');
            status = `error: ${turn.error}`;
          } else {
            sessionStatus.set(turn.sessionId, 'idle');
            status = stopped ? 'stopped.' : 'Ready.';
          }
          // Fold the finished turn's output into the session optimistically so
          // the reply doesn't blink out between the turn ending (it leaves the
          // registry) and the canonical history reload landing.
          session.messages.push(.../** @type {any[]} */ (turn.messages));
          notify();
          // Repaint from the daemon's canonical transcript (now including this
          // turn's persisted reply) so the turn's output is never double-shown.
          loadHistory(session).then(() => {
            notify();
            detach();
          });
        }
      };
      unsubscribeTurn = turn.subscribe(onEvent);
      // Settle immediately if the turn finished between start and subscribe.
      if (turn.done) onEvent({ type: 'done' });
    });
  };

  const runConverse = async (/** @type {string} */ text) => {
    let session = getActiveSession();
    if (!session) session = await createSession();

    session.messages.push({ role: 'user', text });
    // Sending a message is an explicit "follow along" intent — re-stick.
    stick = true;
    if (session.title === DEFAULT_TITLE) {
      session.title = autoTitle(text);
      E(factory)
        .renameSession(session.id, session.title)
        .catch(() => {});
    }
    notify();

    // Speak the reply as it streams: feed deltas to the TTS object and play the
    // returned audio stream. Sentence-by-sentence, so audio starts mid-reply.
    const speakLive = ttsEnabled && Boolean(ttsServer);
    if (speakLive) {
      turnTtsFeed = makeTextFeed();
      playAudioStream(E(ttsServer).synthesize(turnTtsFeed.reader));
    }
    // Start the turn in the background — it owns the reply reader and keeps
    // running if this space is left — then render it through the shared view.
    const reader = E(facetFor(session)).converse(text);
    const turn = startFlootTurn(turnKey(session.id), session.id, reader);
    await attachTurnView(turn, session, speakLive);
  };

  // Serialize submissions so an auto-sent voice utterance can't overlap a typed
  // message: each turn waits for the previous.
  const submit = (/** @type {string} */ raw) => {
    // An explicit send supersedes any buffered voice continuation.
    if (resumeTimer) {
      clearTimeout(resumeTimer);
      resumeTimer = 0;
    }
    pendingUtterance = '';
    const text = (raw || '').trim();
    if (!text) return submitChain;
    inputText = '';
    notify();
    submitChain = submitChain.then(() => {
      turnPromise = runConverse(text);
      return turnPromise.catch(() => {});
    });
    return submitChain;
  };

  // ── Session actions (controller callbacks) ──────────────────────────────────
  const openActiveHistory = () => {
    // Opening a session starts at the latest message.
    stick = true;
    const session = getActiveSession();
    if (!session) {
      usage = null;
      notify();
      return;
    }
    showSessionTokens(session);
    // If this session has a turn still running in the background (e.g. it was
    // left mid-reply and we've returned to the space), reattach to its live
    // stream. The busy guard keeps this from firing during another turn.
    const reattach = () => {
      const turn = liveTurnFor(session.id);
      if (turn && !busy) {
        turnPromise = attachTurnView(turn, session);
      }
    };
    if (!session.loaded) {
      loadHistory(session).then(() => {
        if (activeSessionId === session.id) {
          notify();
          reattach();
        }
      });
    } else {
      reattach();
    }
  };

  const selectSession = (/** @type {string} */ id) => {
    if (busy) return; // don't switch context mid-turn
    // A per-message replay plays without setting busy; silence it so it doesn't
    // keep speaking over the session we're switching to.
    stopTts();
    activeSessionId = id;
    setStatus('Ready.');
    openActiveHistory();
  };

  const deleteSessionById = (/** @type {string} */ id) => {
    const session = sessions.find(s => s.id === id);
    if (!session) return;
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete "${session.title}"?`)) return;
    // Stop any replay still speaking the session we're deleting.
    stopTts();
    sessions = sessions.filter(s => s.id !== id);
    sessionStatus.delete(id);
    if (activeSessionId === id) {
      activeSessionId = sessions.length ? sessions[0].id : null;
    }
    E(factory)
      .deleteSession(id)
      .catch(err => setStatus(`error: ${err.message}`));
    notify();
    openActiveHistory();
  };

  /**
   * @param {string} [presetId]
   * @param {string} [model]
   */
  const newSession = (presetId, model) => {
    if (busy) return;
    createSession(undefined, presetId, model)
      .then(() => {
        stick = true;
        notify();
      })
      .catch(err => setStatus(`error: ${err.message}`));
  };

  const renameSession = (
    /** @type {string} */ id,
    /** @type {string} */ title,
  ) => {
    const session = sessions.find(s => s.id === id);
    if (!session) return;
    session.title = title || DEFAULT_TITLE;
    E(factory)
      .renameSession(id, session.title)
      .catch(err => setStatus(`error: ${err.message}`));
    notify();
  };

  // ── Mic input (optional) ─────────────────────────────────────────────────────
  let micActive = false; // mic open and listening
  let speaking = false; // currently inside a detected utterance
  let calibrating = false;
  let noiseFloor = 0;
  let calibStart = 0;
  let speechStart = 0;
  let silenceStart = 0;
  // Continuation buffering across short pauses (see RESUME_GRACE_MS): a finalized
  // utterance accrues here and is only submitted once the grace elapses without
  // the user resuming.
  let pendingUtterance = '';
  let resumeTimer = 0;
  let rafId = 0;
  /** @type {number[]} */
  let calibSamples = [];
  /** @type {Uint8Array[]} */
  let preroll = [];
  let micInRate = 16_000;
  /** @type {MediaStream | null} */
  let mediaStream = null;
  /** @type {AudioContext | null} */
  let audioCtx = null;
  /** @type {MediaStreamAudioSourceNode | null} */
  let source = null;
  /** @type {ScriptProcessorNode | null} */
  let processor = null;
  /** @type {AnalyserNode | null} */
  let analyser = null;
  /** @type {Float32Array<ArrayBuffer> | null} */
  let analyserBuf = null;
  /** @type {ReturnType<typeof makeAudioChannel> | null} */
  let channel = null;

  const filterTranscript = (/** @type {string} */ raw) => {
    const norm = (raw || '')
      .trim()
      .toLowerCase()
      .replace(/[.!?,]+$/g, '')
      .trim();
    if (!norm || norm.length < 2) return '';
    if (JUNK_PHRASES.has(norm)) return '';
    return raw.trim();
  };

  // Drain one utterance's transcript stream. Partials/finals (replace semantics)
  // fill the compose box live; on `end` the filtered text is auto-sent.
  const drainTranscript = async (
    /** @type {any} */ textReader,
    /** @type {any} */ ownChannel,
  ) => {
    let last = '';
    try {
      for await (const raw of iterateReader(textReader, { buffer: 4 })) {
        const value = /** @type {any} */ (raw);
        if (cancelled) break;
        if (value.type === 'partial' || value.type === 'final') {
          last = value.text;
          // Show buffered continuation text ahead of the live partial.
          inputText = pendingUtterance ? `${pendingUtterance} ${last}` : last;
          voiceTranscript = last;
          notify();
        } else if (value.type === 'end') {
          break;
        } else if (value.type === 'abort') {
          setStatus(`mic error: ${value.reason}`);
          break;
        }
      }
    } catch (err) {
      setStatus(`mic error: ${/** @type {Error} */ (err).message}`);
    } finally {
      if (ownChannel === channel) channel = null;
    }
    const text = filterTranscript(last);
    inputText = '';
    voiceTranscript = '';
    notify();
    commitUtterance(text);
  };

  // Buffer a finalized utterance and hold briefly for a continuation before
  // sending, so a mid-thought pause doesn't start a reply and drop the rest.
  const commitUtterance = (/** @type {string} */ text) => {
    if (text) {
      pendingUtterance = pendingUtterance
        ? `${pendingUtterance} ${text}`
        : text;
    }
    if (resumeTimer) clearTimeout(resumeTimer);
    if (!pendingUtterance) return;
    resumeTimer = window.setTimeout(() => {
      resumeTimer = 0;
      const full = pendingUtterance.trim();
      pendingUtterance = '';
      if (full) submit(full);
    }, VAD.RESUME_GRACE_MS);
  };

  const computeRms = () => {
    if (!analyser || !analyserBuf) return 0;
    analyser.getFloatTimeDomainData(analyserBuf);
    let sum = 0;
    for (let i = 0; i < analyserBuf.length; i += 1) {
      sum += analyserBuf[i] * analyserBuf[i];
    }
    return Math.sqrt(sum / analyserBuf.length);
  };

  // Store the meter levels and notify the view (throttled — the VAD loop runs at
  // animation-frame rate, but the meter only needs ~15 Hz). Speaking-state
  // transitions notify immediately via begin/endUtterance.
  let lastMeterNotify = 0;
  const setMeter = (
    /** @type {number} */ vol,
    /** @type {number} */ noise,
    /** @type {number} */ threshold,
  ) => {
    meterVol = vol;
    meterNoise = noise;
    meterThreshold = threshold;
    const now = Date.now();
    if (now - lastMeterNotify >= 60) {
      lastMeterNotify = now;
      notify();
    }
  };

  // Open a fresh transcribe() stream for the utterance just detected and flush
  // the pre-roll so the word's onset isn't clipped.
  const beginUtterance = () => {
    if (speaking || !audioServer) return;
    // If we're within the post-utterance grace, this is a continuation of the
    // same thought: cancel the pending send and keep the buffered text.
    if (resumeTimer) {
      clearTimeout(resumeTimer);
      resumeTimer = 0;
    }
    speaking = true;
    // Never let a reply talk over a live recording: silence any TTS still
    // playing or scheduled ahead.
    stopTts();
    speechStart = Date.now();
    silenceStart = 0;
    // Preserve any buffered continuation text; a fresh utterance clears it.
    inputText = pendingUtterance;
    notify();
    channel = makeAudioChannel();
    const ownChannel = channel;
    const textReader = E(audioServer).transcribe(channel.reader);
    drainTranscript(textReader, ownChannel);
    for (const frame of preroll) ownChannel.writeBytes(frame);
    preroll = [];
  };

  const endUtterance = () => {
    if (!speaking) return;
    speaking = false;
    silenceStart = 0;
    const tooShort = Date.now() - speechStart < VAD.MIN_SPEECH_MS;
    if (tooShort) {
      // A blip below the minimum-speech duration — discard as noise.
      if (channel)
        E(channel.reader)
          .return()
          .catch(() => {});
      channel = null;
      inputText = '';
      notify();
      return;
    }
    notify();
    channel?.end(); // flush → recognizer emits final + end → drainTranscript sends
  };

  const abortUtterance = () => {
    if (!speaking) return;
    speaking = false;
    silenceStart = 0;
    if (channel)
      E(channel.reader)
        .return()
        .catch(() => {});
    channel = null;
  };

  // The VAD heartbeat: one RMS sample per animation frame drives calibration,
  // noise-floor drift, onset/barge-in, and end-of-speech silence detection.
  const vadLoop = () => {
    if (!micActive) return;
    const now = Date.now();
    const vol = computeRms();

    if (calibrating) {
      calibSamples.push(vol);
      setMeter(vol, noiseFloor, VAD.MIN_THRESHOLD);
      if (now - calibStart >= VAD.CALIBRATION_MS) {
        const sorted = [...calibSamples].sort((a, b) => a - b);
        noiseFloor = sorted[Math.floor(sorted.length * 0.75)] || 0;
        calibrating = false;
        calibSamples = [];
        setStatus('listening…');
      }
      rafId = requestAnimationFrame(vadLoop);
      return;
    }

    const speechThreshold = Math.max(
      VAD.MIN_THRESHOLD,
      noiseFloor * VAD.THRESHOLD_MULT,
    );
    const bargeThreshold = Math.max(
      VAD.MIN_BARGE,
      speechThreshold * VAD.BARGE_MULT,
    );
    setMeter(vol, noiseFloor, speechThreshold);

    if (!speaking) {
      if (vol < speechThreshold) {
        // Drift the noise floor toward the ambient level while quiet.
        noiseFloor = (1 - VAD.EMA_ALPHA) * noiseFloor + VAD.EMA_ALPHA * vol;
      }
      // While the assistant is replying require a louder onset (barge-in).
      let onsetThreshold = busy ? bargeThreshold : speechThreshold;
      // If our own TTS is audibly playing (even after the text turn finished),
      // demand more headroom still so speaker→mic leakage can't self-barge.
      if (ttsAudible()) {
        onsetThreshold = Math.max(
          onsetThreshold,
          bargeThreshold * VAD.ECHO_BARGE_MULT,
        );
      }
      if (vol > onsetThreshold) {
        if (busy) softBargeIn();
        beginUtterance();
      }
    } else if (vol > speechThreshold) {
      silenceStart = 0;
    } else if (silenceStart === 0) {
      silenceStart = now;
    } else if (now - silenceStart >= VAD.SILENCE_MS) {
      endUtterance();
    }

    rafId = requestAnimationFrame(vadLoop);
  };

  const startMic = async () => {
    if (micActive || !audioServer) return;
    micActive = true;
    calibrating = true;
    calibStart = Date.now();
    calibSamples = [];
    noiseFloor = 0;
    preroll = [];
    inputText = '';
    setStatus('calibrating microphone…');
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      audioCtx = new AudioContext();
      source = audioCtx.createMediaStreamSource(mediaStream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyserBuf = new Float32Array(analyser.fftSize);
      processor = audioCtx.createScriptProcessor(4096, 1, 1);
      micInRate = audioCtx.sampleRate;
      processor.onaudioprocess = e => {
        const data = e.inputBuffer.getChannelData(0);
        const pcm = toPcm16le(data, micInRate, 16_000);
        if (!pcm.length) return;
        if (speaking && channel) {
          channel.writeBytes(pcm);
        } else {
          // Ring-buffer recent audio so an utterance's onset isn't clipped.
          preroll.push(pcm);
          if (preroll.length > VAD.PREROLL_FRAMES) preroll.shift();
        }
      };
      source.connect(analyser);
      source.connect(processor);
      processor.connect(audioCtx.destination);
      rafId = requestAnimationFrame(vadLoop);
    } catch (err) {
      micActive = false;
      calibrating = false;
      setStatus(`mic error: ${/** @type {Error} */ (err).message}`);
    }
  };

  const stopMic = () => {
    if (!micActive) return;
    micActive = false;
    calibrating = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    abortUtterance();
    // Drop any buffered voice continuation that never got sent.
    if (resumeTimer) {
      clearTimeout(resumeTimer);
      resumeTimer = 0;
    }
    pendingUtterance = '';
    if (processor) processor.onaudioprocess = null;
    try {
      source?.disconnect();
      analyser?.disconnect();
      processor?.disconnect();
    } catch {
      // already disconnected
    }
    mediaStream?.getTracks().forEach(t => t.stop());
    audioCtx?.close();
    preroll = [];
    source = null;
    processor = null;
    analyser = null;
    analyserBuf = null;
    mediaStream = null;
    audioCtx = null;
    channel = null;
    voiceTranscript = '';
    setStatus('Ready.');
  };

  // ── TTS playback (optional) ──────────────────────────────────────────────────
  /** @type {AudioContext | null} */
  let ttsCtx = null;
  // Token guarding the active playback session: stop() bumps it so a stale
  // drain loop (still awaiting a CapTP next()) can't schedule buffers anymore.
  let ttsPlaybackId = 0;
  /** @type {AudioBufferSourceNode[]} */
  let ttsSources = [];
  // The live audio iteration, held so barge-in can close it (which fires the
  // caplet's onClose and aborts piper mid-utterance).
  /** @type {any} */
  let ttsActiveStream = null;
  let ttsNextStart = 0;
  let ttsSpeaking = false;

  const stopTts = () => {
    ttsPlaybackId += 1;
    for (const src of ttsSources) {
      try {
        src.onended = null;
        src.stop();
      } catch {
        // already stopped
      }
    }
    ttsSources = [];
    ttsNextStart = 0;
    if (ttsActiveStream) {
      // Closing the stream signals the responder over the synchronize chain;
      // swallow the async rejection (it may already be closed remotely).
      ttsActiveStream.return().catch(() => {});
      ttsActiveStream = null;
    }
    if (ttsSpeaking) {
      ttsSpeaking = false;
      notify();
    }
  };

  // True while scheduled TTS audio extends past the present — i.e. the bot is
  // (or is about to be) audibly speaking, so the mic is hearing itself.
  const ttsAudible = () => !!ttsCtx && ttsNextStart > ttsCtx.currentTime;

  // Decode one raw s16le mono PCM chunk into a scheduled AudioBuffer and queue
  // it back-to-back after whatever is already playing.
  const enqueuePcm = (
    /** @type {Uint8Array} */ bytes,
    /** @type {number} */ sampleRate,
  ) => {
    if (!ttsCtx) return;
    const frames = Math.floor(bytes.length / 2);
    if (!frames) return;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
    const buffer = ttsCtx.createBuffer(1, frames, sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) {
      samples[i] = view.getInt16(i * 2, true) / 32_768;
    }
    const src = ttsCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(ttsCtx.destination);
    const startAt = Math.max(ttsCtx.currentTime, ttsNextStart);
    src.start(startAt);
    ttsNextStart = startAt + buffer.duration;
    ttsSources.push(src);
    if (!ttsSpeaking) {
      ttsSpeaking = true;
      notify();
    }
    src.onended = () => {
      ttsSources = ttsSources.filter(s => s !== src);
      if (!ttsSources.length && ttsSpeaking) {
        ttsSpeaking = false;
        notify();
      }
    };
  };

  // Pull synthesized audio from a TTS stream and play it back in order. Resolves
  // when the stream ends or playback is superseded by a newer stopTts().
  const playAudioStream = async (/** @type {any} */ audioReader) => {
    if (!ttsServer) return;
    if (!ttsCtx) ttsCtx = new AudioContext();
    if (ttsCtx.state === 'suspended') {
      try {
        await ttsCtx.resume();
      } catch {
        // best effort
      }
    }
    // Begin a fresh session: bump the token and adopt this reader.
    stopTts();
    const myId = ttsPlaybackId;
    const audio = iterateReader(audioReader, { buffer: 4 });
    ttsActiveStream = audio;
    ttsNextStart = ttsCtx.currentTime;
    try {
      for await (const raw of audio) {
        const value = /** @type {any} */ (raw);
        if (cancelled || myId !== ttsPlaybackId) break;
        if (value.type === 'bytes') {
          enqueuePcm(base64ToBytes(value.b64), value.sampleRate || 22_050);
        } else if (value.type === 'end' || value.type === 'abort') {
          break;
        }
      }
    } catch {
      // stream torn down (close) — playback already scheduled stays
    } finally {
      if (myId === ttsPlaybackId && ttsActiveStream === audio) {
        ttsActiveStream = null;
      }
    }
  };

  // Play a finished message through TTS by feeding its whole text as one delta.
  // Independent of the live turn: starting a replay supersedes any other audio.
  const replayMessage = (/** @type {string} */ text) => {
    if (!ttsServer || !text.trim()) return;
    const feed = makeTextFeed();
    feed.delta(text);
    feed.end();
    replayingText = text;
    notify();
    playAudioStream(E(ttsServer).synthesize(feed.reader)).finally(() => {
      if (replayingText === text) {
        replayingText = '';
        notify();
      }
    });
  };

  // Toggle spoken replies. Turning it off mid-reply silences the current one.
  const toggleTts = () => {
    ttsEnabled = !ttsEnabled;
    if (!ttsEnabled) {
      if (turnTtsFeed) {
        turnTtsFeed.abort();
        turnTtsFeed = null;
      }
      stopTts();
    }
    notify();
  };

  // ── Controller (the view's only handle on the host engine) ───────────────────
  const controller = harden({
    getState,
    subscribe(/** @type {() => void} */ listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    send(/** @type {string | undefined} */ text) {
      submit(typeof text === 'string' ? text : inputText);
    },
    stop() {
      cancelTurn();
    },
    selectSession(/** @type {string} */ id) {
      selectSession(id);
    },
    newSession(
      /** @type {string | undefined} */ presetId,
      /** @type {string | undefined} */ model,
    ) {
      newSession(presetId, model);
    },
    renameSession(/** @type {string} */ id, /** @type {string} */ title) {
      renameSession(id, title);
    },
    deleteSession(/** @type {string} */ id) {
      deleteSessionById(id);
    },
    toggleMic() {
      if (micActive) stopMic();
      else startMic();
    },
    toggleTts() {
      toggleTts();
    },
    replayMessage(/** @type {string} */ text) {
      replayMessage(text);
    },
    toggleSettings() {
      settingsOpen = !settingsOpen;
      notify();
    },
    setInput(/** @type {string} */ text) {
      inputText = text;
      notify();
    },
  });

  // ── Mount the confined Preact view ───────────────────────────────────────────
  $parent.replaceChildren();
  const $mount = $parent.ownerDocument.createElement('div');
  $mount.id = 'floot-root';
  $mount.style.width = '100%';
  $mount.style.height = '100%';
  $parent.appendChild($mount);

  renderConfined(h(FlootApp, { controller }), $mount);

  // Sticky-bottom transcript scrolling lives HOST-side: the confined view cannot
  // touch DOM nodes (the renderer strips refs), so the host owns `$mount` and
  // nudges `.floot-messages` to the bottom after each render while the reader is
  // already near the bottom. A capture-phase scroll listener (scroll does not
  // bubble, but capture still reaches ancestors) tracks whether to keep sticking.
  const STICK_THRESHOLD_PX = 48;
  const onScrollCapture = (/** @type {Event} */ e) => {
    const el = /** @type {HTMLElement} */ (e.target);
    if (!el || !el.classList || !el.classList.contains('floot-messages'))
      return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    stick = dist <= STICK_THRESHOLD_PX;
  };
  $mount.addEventListener('scroll', onScrollCapture, true);
  const scrollObserver = new MutationObserver(() => {
    if (!stick) return;
    const el = /** @type {HTMLElement | null} */ (
      $mount.querySelector('.floot-messages')
    );
    if (el) el.scrollTop = el.scrollHeight;
  });
  scrollObserver.observe($mount, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  // ── Initial load ─────────────────────────────────────────────────────────────
  // Load the session list from the factory (most-recent first), seeding a
  // default session if the factory has none, then repaint the active history.
  (async () => {
    try {
      const [metas, presetList, modelList] = await Promise.all([
        E(factory).listSessions(),
        E(factory)
          .listPresets()
          .catch(() => []),
        E(factory).listModels(),
      ]);
      presets = presetList;
      models = modelList;
      sessions = [...metas]
        .sort(
          (/** @type {any} */ a, /** @type {any} */ b) =>
            (b.createdAt || 0) - (a.createdAt || 0),
        )
        .map((/** @type {any} */ m) => ({
          id: m.id,
          title: m.title || DEFAULT_TITLE,
          createdAt: m.createdAt || 0,
          presetId: m.presetId || DEFAULT_PRESET_ID,
          model: m.model || '',
          messages: [],
          facet: null,
          loaded: false,
        }));
      if (!sessions.length) {
        await createSession();
      } else {
        activeSessionId = sessions[0].id;
      }
      setStatus('Ready.');
      openActiveHistory();
    } catch (err) {
      setStatus(`error: ${/** @type {Error} */ (err).message}`);
    }
  })();

  return () => {
    cancelled = true;
    // Leave any in-flight turn running in the background — just detach our view
    // (don't return the reader, which would abort the agent). The turn finishes
    // and persists; a later remount reattaches or falls back to history.
    if (detachActiveTurnView) detachActiveTurnView();
    if (turnTtsFeed) {
      turnTtsFeed.abort();
      turnTtsFeed = null;
    }
    stopMic();
    stopTts();
    if (ttsCtx) {
      ttsCtx.close().catch(() => {});
      ttsCtx = null;
    }
    scrollObserver.disconnect();
    $mount.removeEventListener('scroll', onScrollCapture, true);
    unmount($mount);
    $mount.remove();
  };
};
harden(flootComponent);
