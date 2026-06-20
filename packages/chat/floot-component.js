// @ts-check

import { E, Far } from '@endo/far';
import harden from '@endo/harden';

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
 * @param {any} reader the Far reply reader returned by session.converse()
 * @returns {FlootTurn}
 */
const startFlootTurn = (key, sessionId, reader) => {
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
      // Returning the reader fires the producer's onClose, which aborts the
      // in-flight agent turn (stops token generation and tool rounds).
      E(reader)
        .return()
        .catch(() => {});
    },
  };
  inFlightTurns.set(key, turn);

  (async () => {
    try {
      for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const { value, done } = await E(reader).next();
        if (done || stopped) break;
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

/**
 * Floot Chat Space. Resolves a Floot factory from the profilePath (the
 * `floot-factory` caplet created by @endo/floot — see packages/floot in the
 * endo4 fork) and holds typed conversations with it, rendering replies
 * token-by-token in the chat-bubble aesthetic of the "Floot Native" web UI.
 *
 * The factory owns every session; the UI never sees the backing guests. Its
 * interface is `createSession(title?) -> facet`, `listSessions() ->
 * [{id,title,createdAt}]`, `getSession(id) -> facet`, `renameSession(id,title)`,
 * `deleteSession(id)`. A session facet exposes `converse(input) -> replyReader`,
 * `getHistory()`, and `getInfo()`.
 *
 * replyReader is an async-iterator exo yielding the floot reply wire shape
 * (append deltas, unlike the transcript wire which replaces):
 *   { type: 'phase', phase } | { type: 'delta', text } | { type: 'final', text }
 *   | { type: 'end' } | { type: 'abort', reason }
 *
 * Each session is an independent conversation persisted in its own guest's
 * petstore (daemon-only — no localStorage). The transcript is repainted from
 * `getHistory()` when a session is opened.
 *
 * When `audioPath` is given, it resolves an audio/transcription object the same
 * way the Voice Space does and shows a mic button: speech is captured as 16 kHz
 * mono PCM, streamed to `transcribe(audioReader) -> textReader`, and the
 * transcript fills the compose box live (replace semantics); when the transcript
 * stream ends, the assembled message is sent to the agent.
 *
 * When `ttsPath` is given, it resolves a separate text-to-speech object and
 * shows a speaker toggle: reply deltas are streamed to `synthesize(textReader)
 * -> audioReader`, which returns raw s16le mono PCM bytes (one event per
 * sentence) that play back via Web Audio as they arrive — so speech begins
 * mid-reply. Voice barge-in and the Stop button silence playback; each finished
 * assistant message gets a ▶ replay button that re-synthesizes its text.
 *
 * @param {HTMLElement} $parent
 * @param {unknown} rootPowers
 * @param {string[]} profilePath
 * @param {(newPath: string[]) => void} _onProfileChange
 * @param {string[]} [audioPath] - pet-name path to an audio/transcription object
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
  $parent.innerHTML = '';

  // Resolve the floot factory by walking the profile path, exactly like the
  // Voice Space resolves its audio object.
  /** @type {any} */
  let factory = rootPowers;
  for (const name of profilePath) {
    factory = E(/** @type {any} */ (factory)).lookup(name);
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

  // ── Sessions (owned by the floot factory; daemon-only, no localStorage) ─────
  const DEFAULT_TITLE = 'New chat';
  const DEFAULT_PRESET_ID = 'general';

  /**
   * @typedef {{ role: 'user' | 'assistant', text?: string,
   *   meta?: { mail?: { from?: string } },
   *   name?: string, args?: string, result?: string | null }} FlootMessage
   * @typedef {{ id: string, title: string, createdAt: number, presetId: string,
   *   messages: FlootMessage[], facet: any, loaded: boolean }} FlootSession
   * @typedef {{ id: string, title: string, description: string }} FlootPreset
   */

  // The factory's preset catalog, loaded lazily on mount. Drives the new-session
  // picker and the per-session "preset" pill label.
  /** @type {FlootPreset[]} */
  let presets = [];
  const presetTitle = (/** @type {string} */ id) =>
    presets.find(p => p.id === id)?.title || id;
  // Short noun shown in the session-list pill. The preset's own title reads as an
  // action ("New project"); the pill wants the capability noun ("project").
  const PILL_LABELS = { 'new-project': 'project', 'full-control': 'endo' };
  const pillLabel = (/** @type {string} */ id) =>
    PILL_LABELS[id] || presetTitle(id);

  // Local view-cache of the factory's sessions. The factory is the source of
  // truth for the list and titles; each session's transcript is the source of
  // truth in its guest (fetched lazily via getHistory and cached in `messages`).
  /** @type {FlootSession[]} */
  let sessions = [];
  /** @type {string | null} */
  let activeSessionId = null;

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
      session.messages = history.map(m =>
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
   */
  const createSession = async (title, presetId) => {
    const facet = await E(factory).createSession(
      title || DEFAULT_TITLE,
      presetId,
    );
    const info = await E(facet).getInfo();
    /** @type {FlootSession} */
    const session = {
      id: info.id,
      title: info.title || DEFAULT_TITLE,
      createdAt: info.createdAt || Date.now(),
      presetId: info.presetId || DEFAULT_PRESET_ID,
      messages: [],
      facet,
      loaded: true,
    };
    sessions.unshift(session);
    activeSessionId = session.id;
    return session;
  };

  // ── UI ─────────────────────────────────────────────────────────────────────
  const $root = document.createElement('div');
  $root.className = 'floot-app';
  $root.innerHTML = `
    <style>
      .floot-app { --fl-bg:#0f0f10; --fl-surface:#17171a; --fl-surface2:#1f1f23;
        --fl-surface3:#26262b; --fl-border:#2a2a2e; --fl-border-strong:#3a3a40;
        --fl-text:#e4e4e7; --fl-text-muted:#8a8a92; --fl-text-faint:#5e5e66;
        --fl-user:#2563eb; --fl-user-text:#fff; --fl-assistant:#27272a;
        --fl-accent:#3b82f6; --fl-red:#ef4444; --fl-green:#22c55e; --fl-amber:#f59e0b;
        --fl-tool:#a78bfa; --fl-tool-result:#86efac;
        --fl-mail:#0e7490; --fl-mail-text:#e0f2fe;
        position: relative; height: 100%; display: flex; box-sizing: border-box;
        background: var(--fl-bg); color: var(--fl-text); overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
      .floot-app * { box-sizing: border-box; }

      .floot-sidebar { width: 240px; flex: none; display: flex; flex-direction: column;
        background: var(--fl-surface); border-right: 1px solid var(--fl-border);
        transition: transform 0.2s ease; }
      .floot-sidebar-head { display: flex; align-items: center; justify-content: space-between;
        padding: 0.75rem 0.85rem; border-bottom: 1px solid var(--fl-border); }
      .floot-sidebar-title { font-size: 0.95rem; font-weight: 600; }
      .floot-new-btn { flex: none; width: 28px; height: 28px; border-radius: 6px;
        border: none; background: var(--fl-accent); color: #fff; cursor: pointer;
        font-size: 1.2rem; line-height: 1; display: flex; align-items: center;
        justify-content: center; transition: background 0.15s; }
      .floot-new-btn:hover { background: #2563eb; }
      .floot-session-list { flex: 1; min-height: 0; overflow-y: auto; padding: 0.4rem; }
      .floot-session-empty { padding: 1rem 0.75rem; font-size: 0.85rem;
        color: var(--fl-text-faint); text-align: center; }

      .floot-session-item { position: relative; display: flex; align-items: center;
        gap: 0.4rem; padding: 0.5rem 0.6rem; border-radius: 6px; cursor: pointer;
        margin-bottom: 2px; color: var(--fl-text-muted); transition: background 0.12s; }
      .floot-session-item:hover { background: var(--fl-surface2); }
      .floot-session-item.active { background: var(--fl-surface3); }
      .floot-session-item.active .floot-session-name { color: var(--fl-text); }
      .floot-status-dot { flex: none; width: 7px; height: 7px; border-radius: 50%;
        background: var(--fl-text-faint); }
      .floot-status-dot.streaming { background: var(--fl-accent);
        animation: floot-dot-pulse 1.2s ease-in-out infinite; }
      .floot-status-dot.error { background: var(--fl-red); }
      @keyframes floot-dot-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
      .floot-session-meta { flex: 1; min-width: 0; }
      .floot-session-name { font-size: 0.85rem; white-space: nowrap; overflow: hidden;
        text-overflow: ellipsis; }
      .floot-session-sub { font-size: 0.72rem; color: var(--fl-text-faint);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .floot-session-item .floot-row-btn { flex: none; width: 22px; height: 22px;
        border: none; background: transparent; color: var(--fl-text-muted);
        cursor: pointer; border-radius: 5px; font-size: 0.85rem; line-height: 1;
        display: none; align-items: center; justify-content: center; }
      .floot-session-item:hover .floot-row-btn { display: flex; }
      .floot-row-btn:hover { background: var(--fl-surface3); color: var(--fl-text); }
      .floot-session-title-input { flex: 1; min-width: 0; font: inherit; font-size: 0.9rem;
        padding: 0.15rem 0.35rem; border-radius: 6px; border: 1px solid var(--fl-accent);
        background: var(--fl-bg); color: var(--fl-text); outline: none; }

      .floot-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
      .floot-header { display: flex; align-items: center; gap: 0.5rem;
        padding: 0.75rem 1rem; background: var(--fl-surface);
        border-bottom: 1px solid var(--fl-border); flex-shrink: 0; }
      .floot-menu-btn { display: none; flex: none; width: 34px; height: 34px;
        border: none; background: transparent; color: var(--fl-text-muted);
        border-radius: 6px; cursor: pointer; font-size: 1.25rem;
        align-items: center; justify-content: center; }
      .floot-menu-btn:hover { color: var(--fl-text); background: var(--fl-surface2); }
      .floot-header-title { flex: 1; min-width: 0; font-size: 0.95rem; font-weight: 600;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: text; }
      .floot-header-title-input { flex: 1; min-width: 0; font: inherit; font-weight: 600;
        color: var(--fl-text); background: var(--fl-surface); border: 1px solid var(--fl-border);
        border-radius: 6px; padding: 2px 6px; }

      .floot-messages { flex: 1; min-height: 0; overflow-y: auto;
        padding: 1rem; display: flex; flex-direction: column; gap: 0.5rem;
        scroll-behavior: smooth; }
      .floot-empty-state { margin: auto; text-align: center; color: var(--fl-text-faint);
        font-size: 0.9rem; padding: 2rem; }
      .floot-loading { display: inline-flex; align-items: center; gap: 8px; }
      .floot-spinner { width: 14px; height: 14px; border-radius: 50%;
        border: 2px solid var(--fl-border); border-top-color: var(--fl-text-muted);
        animation: floot-spin 0.8s linear infinite; }
      @keyframes floot-spin { to { transform: rotate(360deg); } }
      .floot-msg-row { display: flex; flex-direction: column;
        animation: floot-fade 0.15s ease; }
      .floot-mail-caption { display: flex; align-items: center; gap: 4px;
        font-size: 0.7rem; color: var(--fl-text-faint); margin-bottom: 2px;
        max-width: 80%; }
      .floot-mail-caption .token { max-width: 14rem; overflow: hidden;
        text-overflow: ellipsis; white-space: nowrap; }
      .floot-msg-row.user { align-items: flex-end; }
      .floot-msg-row.assistant { align-items: flex-start; }
      @keyframes floot-fade { from { opacity: 0; transform: translateY(4px); }
        to { opacity: 1; transform: translateY(0); } }
      .floot-msg { max-width: 80%; padding: 0.6rem 0.9rem; border-radius: 16px;
        font-size: 0.9375rem; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
      .floot-msg-row.user .floot-msg { background: var(--fl-user); color: var(--fl-user-text);
        border-bottom-right-radius: 4px; }
      .floot-msg-row.assistant .floot-msg { background: var(--fl-assistant);
        color: var(--fl-text); border-bottom-left-radius: 4px; }
      .floot-msg-row.mail .floot-msg { background: var(--fl-mail);
        color: var(--fl-mail-text); }
      .floot-msg.streaming::after { content: ''; display: inline-block; width: 6px;
        height: 1em; background: var(--fl-text-muted); vertical-align: text-bottom;
        margin-left: 2px; animation: floot-caret 1s steps(2) infinite; }
      @keyframes floot-caret { 50% { opacity: 0; } }

      .floot-thinking { display: inline-flex; align-items: center; gap: 4px;
        padding: 6px 10px; background: var(--fl-assistant); border-radius: 12px; }
      .floot-thinking span { width: 6px; height: 6px; border-radius: 50%;
        background: var(--fl-text-muted); animation: floot-bounce 1.2s ease-in-out infinite; }
      .floot-thinking span:nth-child(2) { animation-delay: 0.2s; }
      .floot-thinking span:nth-child(3) { animation-delay: 0.4s; }
      @keyframes floot-bounce { 0%,60%,100%{transform:scale(0.9);opacity:0.3}
        30%{transform:scale(1.1);opacity:1} }

      .floot-status-bar { padding: 0.25rem 1rem; font-size: 0.75rem;
        color: var(--fl-text-muted); background: var(--fl-surface);
        border-top: 1px solid var(--fl-border); min-height: 1.6rem;
        display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0; }
      .floot-status-bar.error { color: var(--fl-red); }
      .floot-tokens { margin-left: auto; opacity: 0.6;
        font-variant-numeric: tabular-nums; white-space: nowrap; }

      .floot-meter { display: none; position: relative; height: 6px;
        background: var(--fl-border); overflow: hidden; flex-shrink: 0; }
      .floot-meter.on { display: block; }
      .floot-meter-fill { position: absolute; left: 0; top: 0; bottom: 0; width: 0%;
        background: var(--fl-green); opacity: 0.35; transition: width 0.08s linear; }
      .floot-meter-fill.active { opacity: 1; }
      .floot-meter-noise, .floot-meter-threshold { position: absolute; top: 0; bottom: 0;
        width: 2px; margin-left: -1px; }
      .floot-meter-noise { background: var(--fl-amber); }
      .floot-meter-threshold { background: var(--fl-text); }

      .floot-compose { display: flex; gap: 0.5rem; align-items: flex-end;
        padding: 0.6rem 0.75rem; padding-bottom: max(0.6rem, env(safe-area-inset-bottom));
        background: var(--fl-surface); border-top: 1px solid var(--fl-border); flex-shrink: 0; }
      .floot-input { flex: 1; resize: none; font: inherit; font-size: 16px;
        line-height: 1.4; padding: 0.55rem 1rem; border-radius: 20px;
        border: 1px solid var(--fl-border); background: var(--fl-surface2);
        color: var(--fl-text); max-height: 120px; outline: none; }
      .floot-input::placeholder { color: var(--fl-text-muted); }
      .floot-input:focus { border-color: var(--fl-accent); }
      .floot-send, .floot-mic { flex: none; width: 44px; height: 44px; border-radius: 50%;
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        transition: all 0.15s ease; }
      .floot-send { border: none; background: var(--fl-accent); color: #fff; }
      .floot-send:hover { background: #2563eb; }
      .floot-send.cancel { background: #dc2626; }
      .floot-send.cancel:hover { background: #b91c1c; }
      .floot-send svg { width: 20px; height: 20px; }
      .floot-mic { border: 2px solid var(--fl-border); background: var(--fl-surface2);
        color: var(--fl-text-muted); font-size: 1.15rem; }
      .floot-mic:hover { border-color: var(--fl-text-muted); }
      .floot-mic.listening { border-color: var(--fl-green); color: var(--fl-green); }
      .floot-mic.recording { border-color: var(--fl-green); color: var(--fl-green);
        animation: floot-mic-pulse 1.5s ease infinite; }
      @keyframes floot-mic-pulse { 0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,0.3)}
        50%{box-shadow:0 0 0 6px rgba(34,197,94,0)} }
      .floot-speaker { opacity: 0.5; }
      .floot-speaker.on { opacity: 1; border-color: var(--fl-accent); color: var(--fl-accent); }
      .floot-speaker.speaking { background: var(--fl-accent); color: #fff; border-color: var(--fl-accent); }
      .floot-bubble-wrap { display: flex; align-items: flex-end; gap: 4px; max-width: 80%; }
      .floot-bubble-wrap .floot-msg { max-width: 100%; }
      .floot-replay { flex-shrink: 0; border: none; background: none;
        color: var(--fl-text-muted); cursor: pointer; font-size: 0.7rem; line-height: 1;
        display: flex; align-items: center; gap: 3px; padding: 2px 6px; border-radius: 4px;
        transition: color 0.15s; }
      .floot-replay:hover { color: var(--fl-text); }
      .floot-replay.playing { color: var(--fl-green); }

      .floot-tool { max-width: 80%; background: #1a1a2e; border: 1px solid #2a2a3e;
        border-radius: 10px; padding: 0.5rem 0.75rem; font-size: 0.8rem;
        font-family: "SF Mono", "Fira Code", monospace; color: var(--fl-tool);
        animation: floot-fade 0.15s ease; }
      .floot-tool-label { font-size: 0.65rem; text-transform: uppercase;
        letter-spacing: 0.05em; color: #7c6fbf; margin-bottom: 0.25rem; }
      .floot-tool-pre { white-space: pre-wrap; word-break: break-all; margin: 0;
        color: #c4b5fd; max-height: 150px; overflow-y: auto; }
      .floot-tool.result { background: #1a2e1a; border-color: #2a3e2a;
        color: var(--fl-tool-result); }
      .floot-tool.result .floot-tool-label { color: #4ade80; }
      .floot-tool.result .floot-tool-pre { color: #bbf7d0; }

      .floot-backdrop { display: none; position: absolute; inset: 0;
        background: rgba(0,0,0,0.45); z-index: 4; }

      .floot-modal-backdrop { position: absolute; inset: 0; z-index: 30;
        display: flex; align-items: center; justify-content: center; padding: 1rem;
        background: rgba(0,0,0,0.55); animation: floot-fade 0.12s ease; }
      .floot-modal { width: min(420px, 100%); max-height: 80%; overflow-y: auto;
        background: var(--fl-surface); border: 1px solid var(--fl-border-strong);
        border-radius: 12px; padding: 1rem; box-shadow: 0 12px 40px rgba(0,0,0,0.5); }
      .floot-modal-title { font-size: 1rem; font-weight: 600; margin-bottom: 0.75rem; }
      .floot-preset-list { display: flex; flex-direction: column; gap: 0.5rem; }
      .floot-preset-card { text-align: left; width: 100%; cursor: pointer;
        background: var(--fl-surface2); border: 1px solid var(--fl-border);
        border-radius: 8px; padding: 0.7rem 0.85rem; color: var(--fl-text);
        transition: border-color 0.12s, background 0.12s; }
      .floot-preset-card:hover { background: var(--fl-surface3);
        border-color: var(--fl-accent); }
      .floot-preset-name { font-size: 0.9rem; font-weight: 600; }
      .floot-preset-desc { font-size: 0.78rem; color: var(--fl-text-muted);
        margin-top: 0.15rem; line-height: 1.35; }

      .floot-session-pill { display: inline-block; margin-top: 2px;
        font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.04em;
        padding: 1px 6px; border-radius: 999px; background: var(--fl-surface3);
        color: var(--fl-tool); border: 1px solid var(--fl-border-strong);
        max-width: 100%; overflow: hidden; text-overflow: ellipsis;
        white-space: nowrap; }

      @media (max-width: 640px) {
        .floot-sidebar { position: absolute; z-index: 20; top: 0; bottom: 0; left: 0;
          width: min(280px, 82vw); transform: translateX(-100%);
          box-shadow: 4px 0 16px rgba(0,0,0,0.4); }
        .floot-sidebar.open { transform: translateX(0); }
        .floot-backdrop { z-index: 19; }
        .floot-backdrop.open { display: block; }
        .floot-row-btn { display: flex; }
        .floot-menu-btn { display: flex; align-items: center; justify-content: center; }
        .floot-header { padding: 0.6rem 0.75rem; }
        .floot-messages { padding: 0.75rem; }
      }
    </style>
    <div class="floot-sidebar" id="floot-sidebar">
      <div class="floot-sidebar-head">
        <span class="floot-sidebar-title">Sessions</span>
        <button type="button" class="floot-new-btn" id="floot-new" aria-label="New session">+</button>
      </div>
      <div class="floot-session-list" id="floot-session-list"></div>
    </div>
    <div class="floot-backdrop" id="floot-backdrop"></div>
    <div class="floot-main">
      <div class="floot-header">
        <button type="button" class="floot-menu-btn" id="floot-menu" aria-label="Sessions">☰</button>
        <div class="floot-header-title" id="floot-header-title">Floot</div>
      </div>
      <div class="floot-messages" id="floot-messages"></div>
      <div class="floot-status-bar" id="floot-status">
        <span id="floot-status-text">Ready.</span>
        <span class="floot-tokens" id="floot-tokens"></span>
      </div>
      ${
        hasMic
          ? `<div class="floot-meter" id="floot-meter" aria-hidden="true">
        <div class="floot-meter-fill" id="floot-meter-fill"></div>
        <div class="floot-meter-noise" id="floot-meter-noise" title="Background noise"></div>
        <div class="floot-meter-threshold" id="floot-meter-threshold" title="Speech threshold"></div>
      </div>`
          : ''
      }
      <div class="floot-compose">
        ${
          hasMic
            ? `<button type="button" class="floot-mic" id="floot-mic" aria-label="Speak">🎙</button>`
            : ''
        }
        ${
          hasTts
            ? `<button type="button" class="floot-mic floot-speaker on" id="floot-speaker" aria-label="Toggle spoken replies">🔊</button>`
            : ''
        }
        <textarea class="floot-input" id="floot-input" rows="1"
          placeholder="Message Floot…" aria-label="Message"></textarea>
        <button type="button" class="floot-send" id="floot-send" aria-label="Send"></button>
      </div>
    </div>
  `;
  $parent.appendChild($root);

  const $sidebar = /** @type {HTMLElement} */ (
    $root.querySelector('#floot-sidebar')
  );
  const $backdrop = /** @type {HTMLElement} */ (
    $root.querySelector('#floot-backdrop')
  );
  const $sessionList = /** @type {HTMLElement} */ (
    $root.querySelector('#floot-session-list')
  );
  const $headerTitle = /** @type {HTMLElement} */ (
    $root.querySelector('#floot-header-title')
  );
  $headerTitle.title = 'Double-click to rename';
  $headerTitle.addEventListener('dblclick', () => {
    const session = getActiveSession();
    if (session) startHeaderRename(session);
  });
  const $messages = /** @type {HTMLElement} */ (
    $root.querySelector('#floot-messages')
  );
  // Sticky-bottom: follow new content only while the reader is already at the
  // bottom. The user's own scroll drives this flag, so scrolling up to read
  // history is never fought by incoming deltas; scrolling back down re-sticks.
  let stickToBottom = true;
  const STICK_THRESHOLD_PX = 48;
  $messages.addEventListener('scroll', () => {
    const dist =
      $messages.scrollHeight - $messages.scrollTop - $messages.clientHeight;
    stickToBottom = dist <= STICK_THRESHOLD_PX;
  });
  const $statusText = /** @type {HTMLElement} */ (
    $root.querySelector('#floot-status-text')
  );
  const $tokens = /** @type {HTMLElement} */ (
    $root.querySelector('#floot-tokens')
  );
  const $input = /** @type {HTMLTextAreaElement} */ (
    $root.querySelector('#floot-input')
  );
  const $send = /** @type {HTMLButtonElement} */ (
    $root.querySelector('#floot-send')
  );
  const $newBtn = /** @type {HTMLButtonElement} */ (
    $root.querySelector('#floot-new')
  );
  const $menuBtn = /** @type {HTMLButtonElement} */ (
    $root.querySelector('#floot-menu')
  );
  const $mic = /** @type {HTMLButtonElement | null} */ (
    $root.querySelector('#floot-mic')
  );
  const $speaker = /** @type {HTMLButtonElement | null} */ (
    $root.querySelector('#floot-speaker')
  );
  const $meter = /** @type {HTMLElement | null} */ (
    $root.querySelector('#floot-meter')
  );
  const $meterFill = /** @type {HTMLElement | null} */ (
    $root.querySelector('#floot-meter-fill')
  );
  const $meterNoise = /** @type {HTMLElement | null} */ (
    $root.querySelector('#floot-meter-noise')
  );
  const $meterThreshold = /** @type {HTMLElement | null} */ (
    $root.querySelector('#floot-meter-threshold')
  );

  const SEND_ICON =
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a1 1 0 00-1.39 1.15L4 11l10 1-10 1-1.99 6.25a1 1 0 001.39 1.15z"/></svg>';
  const STOP_ICON =
    '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';

  const setStatus = (/** @type {string} */ s) => {
    $statusText.textContent = s;
  };

  // ── Token usage readout ─────────────────────────────────────────────────────
  const formatTokens = (/** @type {number} */ n) => {
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
    return `${n}`;
  };
  /** @param {{ inputTokens: number, outputTokens: number } | null} u */
  const renderTokens = u => {
    $tokens.textContent =
      u && (u.inputTokens || u.outputTokens)
        ? `↑${formatTokens(u.inputTokens)} ↓${formatTokens(u.outputTokens)}`
        : '';
  };
  // Pull a session's cumulative usage from its guest and show it (cost survives
  // restarts; a live turn updates it again via the 'usage' reply event).
  const showSessionTokens = (
    /** @type {FlootSession | undefined} */ session,
  ) => {
    renderTokens(null);
    if (!session) return;
    E(facetFor(session))
      .getUsage()
      .then((/** @type {any} */ u) => {
        if (activeSessionId === session.id) renderTokens(u);
      })
      .catch(() => {});
  };

  // ── Rendering ───────────────────────────────────────────────────────────────
  /** @type {Map<string, 'idle' | 'streaming' | 'error'>} */
  const sessionStatus = new Map();

  const updateSendButton = () => {
    if (busy) {
      $send.classList.add('cancel');
      $send.innerHTML = STOP_ICON;
      $send.setAttribute('aria-label', 'Stop');
    } else {
      $send.classList.remove('cancel');
      $send.innerHTML = SEND_ICON;
      $send.setAttribute('aria-label', 'Send');
    }
  };

  const renderSidebar = () => {
    $sessionList.innerHTML = '';
    if (!sessions.length) {
      const $e = document.createElement('div');
      $e.className = 'floot-session-empty';
      $e.textContent = 'No sessions yet';
      $sessionList.appendChild($e);
      return;
    }
    for (const session of sessions) {
      const $item = document.createElement('div');
      $item.className = `floot-session-item${session.id === activeSessionId ? ' active' : ''}`;

      const $dot = document.createElement('span');
      // A background turn (even on a non-active session) shows as "thinking".
      const st = liveTurnFor(session.id)
        ? 'streaming'
        : sessionStatus.get(session.id) || 'idle';
      $dot.className = `floot-status-dot${st === 'idle' ? '' : ` ${st}`}`;
      $item.appendChild($dot);

      const $meta = document.createElement('div');
      $meta.className = 'floot-session-meta';
      const $name = document.createElement('div');
      $name.className = 'floot-session-name';
      $name.textContent = session.title;
      const $sub = document.createElement('div');
      $sub.className = 'floot-session-sub';
      const count = session.messages.length;
      if (!session.loaded && count === 0) {
        $sub.textContent = '';
      } else {
        $sub.textContent = count
          ? `${count} message${count === 1 ? '' : 's'}`
          : 'empty';
      }
      $meta.appendChild($name);
      $meta.appendChild($sub);
      // Surface the session's preset (the objects it was seeded with) as a pill,
      // except for the plain default preset which carries no extra capabilities.
      if (session.presetId && session.presetId !== DEFAULT_PRESET_ID) {
        const $pill = document.createElement('span');
        $pill.className = 'floot-session-pill';
        $pill.textContent = pillLabel(session.presetId);
        $meta.appendChild($pill);
      }
      $item.appendChild($meta);

      const $rename = document.createElement('button');
      $rename.type = 'button';
      $rename.className = 'floot-row-btn';
      $rename.textContent = '✎';
      $rename.setAttribute('aria-label', 'Rename');
      $rename.addEventListener('click', e => {
        e.stopPropagation();
        startRename(session, $item, $meta);
      });
      $item.appendChild($rename);

      const $del = document.createElement('button');
      $del.type = 'button';
      $del.className = 'floot-row-btn';
      $del.textContent = '🗑';
      $del.setAttribute('aria-label', 'Delete');
      $del.addEventListener('click', e => {
        e.stopPropagation();
        deleteSession(session);
      });
      $item.appendChild($del);

      $item.addEventListener('click', () => selectSession(session.id));
      $sessionList.appendChild($item);
    }
  };

  const startRename = (
    /** @type {FlootSession} */ session,
    /** @type {HTMLElement} */ $item,
    /** @type {HTMLElement} */ $meta,
  ) => {
    const $field = document.createElement('input');
    $field.type = 'text';
    $field.className = 'floot-session-title-input';
    $field.value = session.title === DEFAULT_TITLE ? '' : session.title;
    $field.placeholder = DEFAULT_TITLE;
    $item.replaceChild($field, $meta);
    $field.focus();
    $field.select();

    let done = false;
    const commit = () => {
      if (done) return;
      done = true;
      const next = $field.value.trim();
      session.title = next || DEFAULT_TITLE;
      E(factory)
        .renameSession(session.id, session.title)
        .catch(err => setStatus(`error: ${err.message}`));
      renderSidebar();
      if (session.id === activeSessionId) renderHeader();
    };
    const cancel = () => {
      if (done) return;
      done = true;
      renderSidebar();
    };
    $field.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
    });
    $field.addEventListener('blur', commit);
    // Clicks inside the editing field shouldn't select the session.
    $field.addEventListener('click', e => e.stopPropagation());
  };

  // Rename the active session inline from the header title.
  const startHeaderRename = (/** @type {FlootSession} */ session) => {
    const $field = document.createElement('input');
    $field.type = 'text';
    $field.className = 'floot-header-title-input';
    $field.value = session.title === DEFAULT_TITLE ? '' : session.title;
    $field.placeholder = DEFAULT_TITLE;
    $headerTitle.replaceWith($field);
    $field.focus();
    $field.select();

    let done = false;
    const finish = (/** @type {boolean} */ save) => {
      if (done) return;
      done = true;
      if (save) {
        session.title = $field.value.trim() || DEFAULT_TITLE;
        E(factory)
          .renameSession(session.id, session.title)
          .catch(err => setStatus(`error: ${err.message}`));
        renderSidebar();
      }
      $field.replaceWith($headerTitle);
      renderHeader();
    };
    $field.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finish(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
      }
    });
    $field.addEventListener('blur', () => finish(true));
  };

  const renderHeader = () => {
    const session = getActiveSession();
    $headerTitle.textContent = session ? session.title : 'Floot';
  };

  const scrollToBottom = () => {
    if (stickToBottom) $messages.scrollTop = $messages.scrollHeight;
  };

  const renderMessages = () => {
    // A full repaint resets scrollTop; preserve the reader's place unless they
    // were following the bottom, in which case snap back down.
    const prevTop = $messages.scrollTop;
    $messages.innerHTML = '';
    // The DOM we tracked is gone; ensureStreamingBubble / renderActiveTurn
    // rebuild these as needed.
    $streamingBubble = null;
    $thinkingRow = null;
    const session = getActiveSession();
    if (!session) {
      const $e = document.createElement('div');
      $e.className = 'floot-empty-state';
      $e.textContent = 'No session selected.';
      $messages.appendChild($e);
      return;
    }
    if (!session.loaded) {
      const $e = document.createElement('div');
      $e.className = 'floot-empty-state floot-loading';
      const $spinner = document.createElement('span');
      $spinner.className = 'floot-spinner';
      $e.append($spinner, document.createTextNode('Loading session…'));
      $messages.appendChild($e);
      return;
    }
    const liveTurn = liveTurnFor(session.id);
    if (!session.messages.length && !liveTurn) {
      const $e = document.createElement('div');
      $e.className = 'floot-empty-state';
      $e.textContent = 'Say hello to Floot.';
      $messages.appendChild($e);
      return;
    }
    for (const msg of session.messages) {
      if (msg.role === 'tool') appendToolRow(msg);
      else appendBubble(msg.role, msg.text || '', msg.meta);
    }
    // Paint the in-flight turn (its flushed output plus the live streaming
    // bubble) after the persisted transcript, so a reattached turn renders
    // identically to the one that produced it.
    if (liveTurn) renderActiveTurn(liveTurn);
    if (stickToBottom) $messages.scrollTop = $messages.scrollHeight;
    else $messages.scrollTop = prevTop;
  };

  // Render an in-flight turn's accumulated output: the assistant/tool messages
  // it has flushed so far, then either the live streaming bubble or a thinking
  // indicator while it works.
  const renderActiveTurn = (/** @type {FlootTurn} */ turn) => {
    for (const msg of turn.messages) {
      if (msg.role === 'tool') appendToolRow(msg);
      else appendBubble('assistant', msg.text || '');
    }
    if (turn.streamingText) {
      const $bubble = appendBubble('assistant', '');
      $bubble.classList.add('streaming');
      $bubble.textContent = turn.streamingText;
      $streamingBubble = $bubble;
    } else if (!turn.done) {
      showThinking();
    }
  };

  const appendBubble = (
    /** @type {'user' | 'assistant'} */ role,
    /** @type {string} */ text,
    /** @type {FlootMessage['meta']} */ meta,
  ) => {
    const $row = document.createElement('div');
    // A turn that arrived by mail is captioned with the sender as a pill (the
    // shared chat token chip) and gets its own bubble color, so it reads as
    // incoming mail rather than something the local user typed.
    const mailFrom = meta && meta.mail && meta.mail.from;
    $row.className = `floot-msg-row ${role}${mailFrom ? ' mail' : ''}`;
    if (mailFrom) {
      const $caption = document.createElement('div');
      $caption.className = 'floot-mail-caption';
      $caption.appendChild(document.createTextNode('Mail from '));
      const $pill = document.createElement('span');
      $pill.className = 'token message-token';
      $pill.textContent = `@${mailFrom}`;
      $caption.appendChild($pill);
      $row.appendChild($caption);
    }
    const $bubble = document.createElement('div');
    $bubble.className = 'floot-msg';
    $bubble.textContent = text;
    // Per-message replay: re-synthesize the finished assistant text on demand.
    // The button sits to the right of the bubble, aligned to its bottom edge.
    if (role === 'assistant' && ttsServer && text.trim()) {
      const $wrap = document.createElement('div');
      $wrap.className = 'floot-bubble-wrap';
      const $replay = document.createElement('button');
      $replay.type = 'button';
      $replay.className = 'floot-replay';
      $replay.textContent = '▶';
      $replay.setAttribute('aria-label', 'Replay');
      $replay.addEventListener('click', () => replayMessage(text, $replay));
      $wrap.append($bubble, $replay);
      $row.appendChild($wrap);
    } else {
      $row.appendChild($bubble);
    }
    $messages.appendChild($row);
    return $bubble;
  };

  // A single tool block (the call, purple; or its result, green), left-aligned
  // in the flow — matching the standalone Floot's tool-block aesthetic.
  const makeToolBlock = (
    /** @type {string} */ name,
    /** @type {string} */ content,
    /** @type {boolean} */ isResult,
  ) => {
    const $row = document.createElement('div');
    $row.className = 'floot-msg-row assistant';
    const $tool = document.createElement('div');
    $tool.className = `floot-tool${isResult ? ' result' : ''}`;
    const $label = document.createElement('div');
    $label.className = 'floot-tool-label';
    $label.textContent = `${name || 'tool'}${isResult ? ' result' : ''}`;
    const $pre = document.createElement('pre');
    $pre.className = 'floot-tool-pre';
    $pre.textContent = content;
    $tool.append($label, $pre);
    $row.appendChild($tool);
    return $row;
  };

  // Render a tool call (and its result, if already known) into the transcript.
  const appendToolRow = (/** @type {any} */ msg) => {
    const $row = makeToolBlock(msg.name, msg.args || '', false);
    $messages.appendChild($row);
    if (msg.result != null) {
      $messages.appendChild(makeToolBlock(msg.name, msg.result, true));
    }
    return $row;
  };

  // Play a finished message through TTS by feeding its whole text as one delta.
  // Independent of the live turn: starting a replay supersedes any other audio.
  const replayMessage = (
    /** @type {string} */ text,
    /** @type {HTMLElement} */ $btn,
  ) => {
    if (!ttsServer) return;
    const feed = makeTextFeed();
    feed.delta(text);
    feed.end();
    $btn.classList.add('playing');
    playAudioStream(E(ttsServer).synthesize(feed.reader)).finally(() => {
      $btn.classList.remove('playing');
    });
  };

  /** @type {HTMLElement | null} */
  let $thinkingRow = null;
  /** @type {HTMLElement | null} */
  let $streamingBubble = null;

  const showThinking = () => {
    hideThinking();
    const $row = document.createElement('div');
    $row.className = 'floot-msg-row assistant';
    $row.innerHTML =
      '<div class="floot-thinking"><span></span><span></span><span></span></div>';
    $messages.appendChild($row);
    $thinkingRow = $row;
    scrollToBottom();
  };

  const hideThinking = () => {
    if ($thinkingRow) {
      $thinkingRow.remove();
      $thinkingRow = null;
    }
  };

  const ensureStreamingBubble = () => {
    if ($streamingBubble) return $streamingBubble;
    hideThinking();
    const $bubble = appendBubble('assistant', '');
    $bubble.classList.add('streaming');
    $streamingBubble = $bubble;
    return $bubble;
  };

  // ── Session actions ─────────────────────────────────────────────────────────
  // Open a session, repainting its transcript from the guest on first view.
  const openActiveHistory = () => {
    // Opening a session starts at the latest message.
    stickToBottom = true;
    const session = getActiveSession();
    if (!session) {
      renderTokens(null);
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
          renderMessages();
          renderSidebar();
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
    $streamingBubble = null;
    closeSidebar();
    renderSidebar();
    renderHeader();
    renderMessages();
    openActiveHistory();
    setStatus('Ready.');
    $input.focus();
  };

  const deleteSession = (/** @type {FlootSession} */ session) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete "${session.title}"?`)) return;
    // Stop any replay still speaking the session we're deleting.
    stopTts();
    sessions = sessions.filter(s => s.id !== session.id);
    sessionStatus.delete(session.id);
    if (activeSessionId === session.id) {
      activeSessionId = sessions.length ? sessions[0].id : null;
      $streamingBubble = null;
    }
    E(factory)
      .deleteSession(session.id)
      .catch(err => setStatus(`error: ${err.message}`));
    renderSidebar();
    renderHeader();
    renderMessages();
    openActiveHistory();
  };

  /** @param {string} [presetId] */
  const newSessionWith = presetId => {
    if (busy) return;
    createSession(undefined, presetId)
      .then(() => {
        $streamingBubble = null;
        closeSidebar();
        renderSidebar();
        renderHeader();
        renderMessages();
        $input.focus();
      })
      .catch(err => setStatus(`error: ${err.message}`));
  };

  // Clicking "+" opens a preset picker so a session can be seeded with default
  // objects (e.g. a git-backed workspace). With one or zero presets there is
  // nothing to choose, so create straight away with the default preset.
  const newSession = () => {
    if (busy) return;
    if (presets.length <= 1) {
      newSessionWith(presets[0]?.id);
      return;
    }
    const $overlay = document.createElement('div');
    $overlay.className = 'floot-modal-backdrop';
    const close = () => {
      $overlay.remove();
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (/** @type {KeyboardEvent} */ e) => {
      if (e.key === 'Escape') close();
    };
    const $modal = document.createElement('div');
    $modal.className = 'floot-modal';
    const $title = document.createElement('div');
    $title.className = 'floot-modal-title';
    $title.textContent = 'Start a new session';
    $modal.appendChild($title);
    const $list = document.createElement('div');
    $list.className = 'floot-preset-list';
    for (const preset of presets) {
      const $card = document.createElement('button');
      $card.type = 'button';
      $card.className = 'floot-preset-card';
      const $name = document.createElement('div');
      $name.className = 'floot-preset-name';
      $name.textContent = preset.title;
      const $desc = document.createElement('div');
      $desc.className = 'floot-preset-desc';
      $desc.textContent = preset.description || '';
      $card.appendChild($name);
      $card.appendChild($desc);
      $card.addEventListener('click', () => {
        close();
        newSessionWith(preset.id);
      });
      $list.appendChild($card);
    }
    $modal.appendChild($list);
    $overlay.appendChild($modal);
    $overlay.addEventListener('click', e => {
      if (e.target === $overlay) close();
    });
    document.addEventListener('keydown', onKey);
    $root.appendChild($overlay);
  };

  const openSidebar = () => {
    $sidebar.classList.add('open');
    $backdrop.classList.add('open');
  };
  const closeSidebar = () => {
    $sidebar.classList.remove('open');
    $backdrop.classList.remove('open');
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

  // Cancel the in-flight turn (Stop button or voice barge-in). Returns a promise
  // that resolves once the turn has fully unwound, so a caller can start the next
  // turn without racing the shared streaming bubble.
  // The text feed driving live spoken replies for the current turn (null when
  // TTS is off or idle). Aborting it ends synthesis; stopTts() halts playback.
  /** @type {ReturnType<typeof makeTextFeed> | null} */
  let turnTtsFeed = null;

  const cancelTurn = () => {
    if (!busy) return Promise.resolve();
    turnCancelled = true;
    // Stop button / barge-in: explicitly tear the turn down (unlike leaving the
    // space, which lets it keep running in the background).
    if (activeTurn) activeTurn.stop();
    if (turnTtsFeed) turnTtsFeed.abort();
    stopTts(); // barge-in / Stop also silences any spoken reply in progress
    return turnPromise || Promise.resolve();
  };

  // Attach this component's view to a background turn — the one it just started,
  // or one still running after a remount. Renders the turn's events live and
  // resolves when the turn ends. Detaching (on unmount) leaves the turn running.
  /**
   * @param {FlootTurn} turn
   * @param {FlootSession} session
   * @param {boolean} [speakLive] feed reply deltas to TTS (producing view only)
   * @returns {Promise<void>}
   */
  const attachTurnView = (turn, session, speakLive = false) => {
    busy = true;
    turnCancelled = false;
    activeTurn = turn;
    updateSendButton();
    sessionStatus.delete(session.id);
    // On reattach the bubble already shows what streamed before; only speak text
    // that arrives from here on.
    let lastSpoken = turn.streamingText.length;
    renderSidebar();
    renderHeader();
    renderMessages();
    setStatus(`${turn.phase || 'thinking'}…`);
    if (turn.usage) renderTokens(turn.usage);

    return new Promise(resolve => {
      const detach = () => {
        if (unsubscribeTurn) {
          unsubscribeTurn();
          unsubscribeTurn = null;
        }
        detachActiveTurnView = null;
        if (activeTurn === turn) activeTurn = null;
        busy = false;
        updateSendButton();
        resolve();
      };
      detachActiveTurnView = detach;

      /** @param {{ type: string }} ev */
      const onEvent = ev => {
        // Ignore events for a session we're no longer viewing (defensive; the
        // busy guard normally blocks switching mid-turn).
        if (activeSessionId !== turn.sessionId) return;
        if (ev.type === 'delta' || ev.type === 'final') {
          ensureStreamingBubble().textContent = turn.streamingText;
          scrollToBottom();
          if (
            speakLive &&
            turnTtsFeed &&
            turn.streamingText.length > lastSpoken
          ) {
            turnTtsFeed.delta(turn.streamingText.slice(lastSpoken));
            lastSpoken = turn.streamingText.length;
          }
        } else if (ev.type === 'tool_call') {
          lastSpoken = 0;
          if ($streamingBubble) {
            $streamingBubble.classList.remove('streaming');
            $streamingBubble = null;
          }
          renderMessages();
          scrollToBottom();
        } else if (ev.type === 'tool_result') {
          renderMessages();
          scrollToBottom();
        } else if (ev.type === 'phase') {
          setStatus(`${turn.phase}…`);
        } else if (ev.type === 'usage') {
          renderTokens(turn.usage);
        } else if (ev.type === 'abort') {
          sessionStatus.set(turn.sessionId, 'error');
        } else if (ev.type === 'done') {
          const stopped = turnCancelled;
          if (turnTtsFeed) {
            if (turn.error) turnTtsFeed.abort();
            else turnTtsFeed.end();
            turnTtsFeed = null;
          }
          $streamingBubble = null;
          hideThinking();
          if (turn.error) {
            sessionStatus.set(turn.sessionId, 'error');
            setStatus(`error: ${turn.error}`);
          } else {
            sessionStatus.set(turn.sessionId, 'idle');
            setStatus(stopped ? 'stopped.' : 'Ready.');
          }
          // Repaint from the daemon's canonical transcript (now including this
          // turn's persisted reply) so the turn's output is never double-shown.
          loadHistory(session).then(() => {
            if (activeSessionId === session.id) {
              renderMessages();
              renderSidebar();
            }
          });
          renderSidebar();
          detach();
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
    stickToBottom = true;
    if (session.title === DEFAULT_TITLE) {
      session.title = autoTitle(text);
      E(factory)
        .renameSession(session.id, session.title)
        .catch(() => {});
    }

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
  // message over the shared streaming bubble: each turn waits for the previous.
  const submit = (/** @type {string} */ raw) => {
    // An explicit send supersedes any buffered voice continuation.
    if (resumeTimer) {
      clearTimeout(resumeTimer);
      resumeTimer = 0;
    }
    pendingUtterance = '';
    const text = (raw || '').trim();
    if (!text) return submitChain;
    $input.value = '';
    $input.style.height = 'auto';
    submitChain = submitChain.then(() => {
      turnPromise = runConverse(text);
      return turnPromise.catch(() => {});
    });
    return submitChain;
  };

  // Enter sends; Shift+Enter inserts a newline.
  $input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit($input.value);
    }
  });
  // Auto-grow the textarea up to its max-height.
  const autoGrow = () => {
    $input.style.height = 'auto';
    $input.style.height = `${Math.min($input.scrollHeight, 120)}px`;
  };
  $input.addEventListener('input', autoGrow);
  $send.addEventListener('click', () => {
    if (busy) cancelTurn();
    else submit($input.value);
  });
  $newBtn.addEventListener('click', () => newSession());
  $menuBtn.addEventListener('click', () => openSidebar());
  $backdrop.addEventListener('click', () => closeSidebar());

  // ── Mic input (optional) ────────────────────────────────────────────────────
  // Continuous, hands-free listening with noise-floor voice-activity detection
  // (ported from the Floot Native web UI's useVAD). The mic stays open; an
  // AnalyserNode tracks RMS volume. After a 1s calibration we learn the room's
  // noise floor and derive a speech threshold; crossing it starts an utterance
  // (a fresh transcribe() stream), and trailing silence ends it and auto-sends.
  // Speech onset while the assistant is replying barges in (cancels the reply).
  //
  // Note: barge-in here interrupts the streaming *text* reply. Spoken-audio
  // barge-in (ducking TTS) isn't possible yet — the endo4 audio caplet exposes
  // only transcribe(); there is no TTS capability to interrupt.
  const VAD = {
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
    // cancellation; without this the bot barges in on itself. Real barge-in
    // still works — the user just has to out-speak the playback.
    ECHO_BARGE_MULT: 2,
    MIN_THRESHOLD: 0.01,
    MIN_BARGE: 0.05,
    DISPLAY_FULL_SCALE: 0.1,
  };

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
  /** @type {Float32Array | null} */
  let analyserBuf = null;
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

  function base64ToBytes(/** @type {string} */ b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  // ── TTS playback (optional) ─────────────────────────────────────────────────
  // A buffered Far text reader the chat feeds reply text into: streaming reply
  // deltas while a turn runs, or a finished message's full text for replay. The
  // remote TTS object pulls deltas with next() and returns an audio stream.
  // Wire (APPEND deltas): { type:'delta', text } | { type:'end' } | { type:'abort' }
  function makeTextFeed() {
    /** @type {any[]} */
    let events = [];
    let cursor = 0;
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
    const reader = Far('TextReader', {
      next: async () => {
        for (;;) {
          if (cursor < events.length) {
            const event = events[cursor];
            cursor += 1;
            return harden({ value: event, done: false });
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
        events = [];
        wakeUp();
        return harden({ value: undefined, done: true });
      },
      throw: async (/** @type {any} */ error) => {
        finished = true;
        events = [];
        wakeUp();
        throw error;
      },
    });
    return {
      reader,
      delta: (/** @type {string} */ text) => {
        if (finished) return;
        events.push(harden({ type: 'delta', text }));
        wakeUp();
      },
      end: () => {
        if (finished) return;
        events.push(harden({ type: 'end' }));
        finished = true;
        wakeUp();
      },
      abort: () => {
        if (finished) return;
        events.push(harden({ type: 'abort', reason: 'cancelled' }));
        finished = true;
        wakeUp();
      },
    };
  }

  /** @type {AudioContext | null} */
  let ttsCtx = null;
  // Token guarding the active playback session: stop() bumps it so a stale
  // drain loop (still awaiting a CapTP next()) can't schedule buffers anymore.
  let ttsPlaybackId = 0;
  /** @type {AudioBufferSourceNode[]} */
  let ttsSources = [];
  /** @type {any} */
  let ttsActiveReader = null;
  let ttsNextStart = 0;

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
    if (ttsActiveReader) {
      // return() is an eventual-send; swallow its async rejection (the reader
      // may already be closed remotely) instead of leaking an unhandled
      // rejection from the sync try/catch this used to sit in.
      E(ttsActiveReader)
        .return()
        .catch(() => {});
      ttsActiveReader = null;
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
    src.onended = () => {
      ttsSources = ttsSources.filter(s => s !== src);
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
    ttsActiveReader = audioReader;
    ttsNextStart = ttsCtx.currentTime;
    try {
      for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const { value, done } = await E(audioReader).next();
        if (done || cancelled || myId !== ttsPlaybackId) break;
        if (value.type === 'bytes') {
          enqueuePcm(base64ToBytes(value.b64), value.sampleRate || 22_050);
        } else if (value.type === 'end' || value.type === 'abort') {
          break;
        }
      }
    } catch {
      // stream torn down (return()/throw()) — playback already scheduled stays
    } finally {
      if (myId === ttsPlaybackId && ttsActiveReader === audioReader) {
        ttsActiveReader = null;
      }
    }
  };

  // Transcripts the recognizer commonly hallucinates from silence/noise; drop
  // them so a stray blip doesn't auto-send a junk turn.
  const JUNK_PHRASES = new Set([
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
  ]);

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
      for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const { value, done } = await E(textReader).next();
        if (done || cancelled) break;
        if (value.type === 'partial' || value.type === 'final') {
          last = value.text;
          // Show buffered continuation text ahead of the live partial.
          $input.value = pendingUtterance
            ? `${pendingUtterance} ${last}`
            : last;
          autoGrow();
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
    $input.value = '';
    autoGrow();
    commitUtterance(text);
  };

  // Buffer a finalized utterance and hold briefly for a continuation before
  // sending, so a mid-thought pause doesn't start a reply and drop the rest.
  // beginUtterance() cancels this timer when the user resumes within the grace.
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

  const paintMeter = (
    /** @type {number} */ vol,
    /** @type {number} */ noise,
    /** @type {number} */ threshold,
  ) => {
    if (!$meterFill || !$meterNoise || !$meterThreshold) return;
    const pct = (/** @type {number} */ v) =>
      `${Math.min(100, (v / VAD.DISPLAY_FULL_SCALE) * 100)}%`;
    $meterFill.style.width = pct(vol);
    $meterFill.classList.toggle('active', speaking);
    $meterNoise.style.left = pct(noise);
    $meterThreshold.style.left = pct(threshold);
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
    // playing or scheduled ahead. (Barge-in's cancelTurn only covers the
    // busy window; a finished turn's queued audio would otherwise play on.)
    stopTts();
    speechStart = Date.now();
    silenceStart = 0;
    $mic?.classList.add('recording');
    // Preserve any buffered continuation text; a fresh utterance clears it.
    $input.value = pendingUtterance;
    autoGrow();
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
    $mic?.classList.remove('recording');
    const tooShort = Date.now() - speechStart < VAD.MIN_SPEECH_MS;
    if (tooShort) {
      // A blip below the minimum-speech duration — discard as noise.
      if (channel)
        E(channel.reader)
          .return()
          .catch(() => {});
      channel = null;
      $input.value = '';
      autoGrow();
      return;
    }
    channel?.end(); // flush → recognizer emits final + end → drainTranscript sends
  };

  const abortUtterance = () => {
    if (!speaking) return;
    speaking = false;
    silenceStart = 0;
    $mic?.classList.remove('recording');
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
      paintMeter(vol, noiseFloor, VAD.MIN_THRESHOLD);
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
    paintMeter(vol, noiseFloor, speechThreshold);

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
        if (busy) cancelTurn();
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
    $mic?.classList.add('listening');
    $meter?.classList.add('on');
    $input.value = '';
    autoGrow();
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
      $mic?.classList.remove('listening');
      $meter?.classList.remove('on');
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
    $mic?.classList.remove('listening');
    $mic?.classList.remove('recording');
    $meter?.classList.remove('on');
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
    setStatus('Ready.');
  };

  // Toggle continuous listening: click to start, click again to stop.
  $mic?.addEventListener('click', () => {
    if (micActive) stopMic();
    else startMic();
  });

  // Toggle spoken replies. Turning it off mid-reply silences the current one.
  $speaker?.addEventListener('click', () => {
    ttsEnabled = !ttsEnabled;
    $speaker.classList.toggle('on', ttsEnabled);
    if (!ttsEnabled) {
      if (turnTtsFeed) {
        turnTtsFeed.abort();
        turnTtsFeed = null;
      }
      stopTts();
    }
  });

  // ── Initial paint ────────────────────────────────────────────────────────────
  updateSendButton();
  renderSidebar();
  renderHeader();
  renderMessages();
  setStatus('Loading sessions…');
  $input.focus();

  // Load the session list from the factory (most-recent first), seeding a
  // default session if the factory has none, then repaint the active history.
  (async () => {
    try {
      const [metas, presetList] = await Promise.all([
        E(factory).listSessions(),
        E(factory)
          .listPresets()
          .catch(() => []),
      ]);
      presets = presetList;
      sessions = [...metas]
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .map(m => ({
          id: m.id,
          title: m.title || DEFAULT_TITLE,
          createdAt: m.createdAt || 0,
          presetId: m.presetId || DEFAULT_PRESET_ID,
          messages: [],
          facet: null,
          loaded: false,
        }));
      if (!sessions.length) {
        await createSession();
      } else {
        activeSessionId = sessions[0].id;
      }
      renderSidebar();
      renderHeader();
      renderMessages();
      openActiveHistory();
      setStatus('Ready.');
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
  };
};
harden(flootComponent);
