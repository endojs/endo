// @ts-check

import { E, Far } from '@endo/far';
import harden from '@endo/harden';

/**
 * Floot Chat Space. Resolves a Floot streaming-agent driver from the
 * profilePath (the `*-driver` caplet created by @endo/floot's factory — see
 * packages/floot in the endo4 fork) and holds typed conversations with it,
 * rendering replies token-by-token in the chat-bubble aesthetic of the
 * "Floot Native" web UI.
 *
 * The driver's interface is `converse(input, sessionId) -> replyReader`, where
 * replyReader is an async-iterator exo yielding the floot reply wire shape
 * (append deltas, unlike the transcript wire which replaces):
 *   { type: 'phase', phase } | { type: 'delta', text } | { type: 'final', text }
 *   | { type: 'end' } | { type: 'abort', reason }
 *
 * Sessions are independent conversation threads. The backend keeps each
 * session's context (its own root in the conversation tree, keyed by the
 * sessionId we pass). The driver exposes no history-read API, so this client
 * keeps its own transcript copy in localStorage (keyed by the profile path) to
 * repaint sessions across reloads.
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

  // ── Session store (localStorage, keyed by the profile path) ────────────────
  const DEFAULT_TITLE = 'New chat';
  const personaId = profilePath.join('/');
  const STORAGE_KEY = `floot-sessions:${personaId}`;

  /**
   * @typedef {{ role: 'user' | 'assistant', text: string }} FlootMessage
   * @typedef {{ id: string, title: string, messages: FlootMessage[],
   *   createdAt: number, updatedAt: number }} FlootSession
   */

  const newId = () =>
    `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  /** @returns {FlootSession[]} */
  const loadSessions = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(s => s && typeof s.id === 'string')
        .map(s => ({
          id: s.id,
          title: typeof s.title === 'string' ? s.title : DEFAULT_TITLE,
          messages: Array.isArray(s.messages)
            ? s.messages.filter(m => m && (m.role === 'user' || m.role === 'assistant'))
            : [],
          createdAt: typeof s.createdAt === 'number' ? s.createdAt : Date.now(),
          updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : Date.now(),
        }));
    } catch {
      return [];
    }
  };

  const saveSessions = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch {
      // storage full / unavailable — transcripts just won't persist
    }
  };

  /** @type {FlootSession[]} */
  let sessions = loadSessions();
  /** @type {string | null} */
  let activeSessionId = sessions.length ? sessions[0].id : null;

  const getActiveSession = () =>
    sessions.find(s => s.id === activeSessionId) || null;

  const autoTitle = (/** @type {string} */ text) => {
    const trimmed = text.trim().replace(/\s+/g, ' ');
    if (!trimmed) return DEFAULT_TITLE;
    return trimmed.length > 60 ? `${trimmed.slice(0, 60)}…` : trimmed;
  };

  const createSession = () => {
    const now = Date.now();
    /** @type {FlootSession} */
    const session = {
      id: newId(),
      title: DEFAULT_TITLE,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    sessions.unshift(session);
    activeSessionId = session.id;
    saveSessions();
    return session;
  };

  // ── UI ─────────────────────────────────────────────────────────────────────
  const $root = document.createElement('div');
  $root.className = 'floot-app';
  $root.innerHTML = `
    <style>
      .floot-app { --fl-bg:#0f0f10; --fl-surface:#17171a; --fl-surface2:#1f1f23;
        --fl-surface3:#26262b; --fl-border:#2a2a2e; --fl-text:#e4e4e7;
        --fl-text-muted:#8a8a92; --fl-text-faint:#5e5e66; --fl-user:#2563eb;
        --fl-user-text:#fff; --fl-assistant:#27272a; --fl-accent:#3b82f6;
        --fl-red:#ef4444; --fl-green:#22c55e; --fl-amber:#f59e0b;
        position: relative; height: 100%; display: flex; box-sizing: border-box;
        background: var(--fl-bg); color: var(--fl-text); overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
      .floot-app * { box-sizing: border-box; }

      .floot-sidebar { width: 240px; flex: none; display: flex; flex-direction: column;
        background: var(--fl-surface); border-right: 1px solid var(--fl-border);
        transition: transform 0.2s ease; }
      .floot-sidebar-head { display: flex; align-items: center; justify-content: space-between;
        padding: 0.75rem 0.85rem; border-bottom: 1px solid var(--fl-border); }
      .floot-sidebar-title { font-size: 0.8rem; font-weight: 600; letter-spacing: 0.04em;
        text-transform: uppercase; color: var(--fl-text-muted); }
      .floot-new-btn { flex: none; width: 28px; height: 28px; border-radius: 7px;
        border: 1px solid var(--fl-border); background: var(--fl-surface2);
        color: var(--fl-text); cursor: pointer; font-size: 1.1rem; line-height: 1;
        display: flex; align-items: center; justify-content: center; }
      .floot-new-btn:hover { background: var(--fl-surface3); }
      .floot-session-list { flex: 1; min-height: 0; overflow-y: auto; padding: 0.4rem; }
      .floot-session-empty { padding: 1rem 0.75rem; font-size: 0.85rem;
        color: var(--fl-text-faint); text-align: center; }

      .floot-session-item { position: relative; display: flex; align-items: center;
        gap: 0.5rem; padding: 0.5rem 0.6rem; border-radius: 9px; cursor: pointer;
        margin-bottom: 2px; }
      .floot-session-item:hover { background: var(--fl-surface2); }
      .floot-session-item.active { background: var(--fl-surface3); }
      .floot-status-dot { flex: none; width: 8px; height: 8px; border-radius: 50%;
        background: var(--fl-text-faint); }
      .floot-status-dot.streaming { background: var(--fl-accent);
        animation: floot-dot-pulse 1.2s ease-in-out infinite; }
      .floot-status-dot.error { background: var(--fl-red); }
      @keyframes floot-dot-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
      .floot-session-meta { flex: 1; min-width: 0; }
      .floot-session-name { font-size: 0.9rem; white-space: nowrap; overflow: hidden;
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
      .floot-header { display: flex; align-items: center; gap: 0.6rem;
        padding: 0.7rem 1rem; border-bottom: 1px solid var(--fl-border); }
      .floot-menu-btn { display: none; flex: none; width: 32px; height: 32px;
        border: 1px solid var(--fl-border); background: var(--fl-surface2);
        color: var(--fl-text); border-radius: 7px; cursor: pointer; font-size: 1rem; }
      .floot-header-title { flex: 1; min-width: 0; font-size: 1rem; font-weight: 600;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

      .floot-messages { flex: 1; min-height: 0; overflow-y: auto;
        padding: 1.25rem 1rem; display: flex; flex-direction: column; gap: 0.6rem; }
      .floot-empty-state { margin: auto; color: var(--fl-text-faint); font-size: 0.95rem; }
      .floot-msg-row { display: flex; }
      .floot-msg-row.user { justify-content: flex-end; }
      .floot-msg-row.assistant { justify-content: flex-start; }
      .floot-msg { max-width: 80%; padding: 0.6rem 0.85rem; border-radius: 16px;
        font-size: 0.95rem; line-height: 1.45; white-space: pre-wrap; word-wrap: break-word; }
      .floot-msg-row.user .floot-msg { background: var(--fl-user); color: var(--fl-user-text);
        border-bottom-right-radius: 4px; }
      .floot-msg-row.assistant .floot-msg { background: var(--fl-assistant);
        color: var(--fl-text); border-bottom-left-radius: 4px; }
      .floot-msg.streaming::after { content: '▋'; margin-left: 1px; color: var(--fl-accent);
        animation: floot-caret 1s steps(1) infinite; }
      @keyframes floot-caret { 50% { opacity: 0; } }

      .floot-thinking { display: inline-flex; gap: 4px; padding: 0.7rem 0.9rem;
        background: var(--fl-assistant); border-radius: 16px; border-bottom-left-radius: 4px; }
      .floot-thinking span { width: 7px; height: 7px; border-radius: 50%;
        background: var(--fl-text-muted); animation: floot-bounce 1.2s ease-in-out infinite; }
      .floot-thinking span:nth-child(2) { animation-delay: 0.15s; }
      .floot-thinking span:nth-child(3) { animation-delay: 0.3s; }
      @keyframes floot-bounce { 0%,60%,100%{transform:translateY(0);opacity:0.4}
        30%{transform:translateY(-4px);opacity:1} }

      .floot-status-bar { padding: 0.3rem 1rem; font-size: 0.75rem;
        color: var(--fl-text-faint); border-top: 1px solid var(--fl-border); }

      .floot-meter { display: none; position: relative; height: 4px; margin: 0 1rem 0.3rem;
        border-radius: 2px; background: var(--fl-surface3); overflow: hidden; }
      .floot-meter.on { display: block; }
      .floot-meter-fill { position: absolute; left: 0; top: 0; bottom: 0; width: 0%;
        background: var(--fl-text-muted); transition: width 0.05s linear; }
      .floot-meter-fill.active { background: var(--fl-green); }
      .floot-meter-noise, .floot-meter-threshold { position: absolute; top: -2px; bottom: -2px;
        width: 2px; }
      .floot-meter-noise { background: var(--fl-text-faint); }
      .floot-meter-threshold { background: var(--fl-amber); }

      .floot-compose { display: flex; gap: 0.5rem; align-items: flex-end;
        padding: 0.75rem 1rem 1rem; border-top: 1px solid var(--fl-border); }
      .floot-input { flex: 1; resize: none; font: inherit; font-size: 0.95rem;
        line-height: 1.4; padding: 0.65rem 0.85rem; border-radius: 14px;
        border: 1px solid var(--fl-border); background: var(--fl-surface2);
        color: var(--fl-text); max-height: 120px; outline: none; }
      .floot-input:focus { border-color: var(--fl-accent); }
      .floot-send, .floot-mic { flex: none; width: 44px; height: 44px; border-radius: 50%;
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        transition: transform 0.15s ease, background 0.15s ease, opacity 0.15s ease; }
      .floot-send { border: none; background: var(--fl-accent); color: #fff; }
      .floot-send:hover { transform: scale(1.06); }
      .floot-send.cancel { background: var(--fl-red); }
      .floot-send svg { width: 18px; height: 18px; }
      .floot-mic { border: 1px solid var(--fl-border); background: var(--fl-surface2);
        color: var(--fl-text); font-size: 1.15rem; }
      .floot-mic:hover { transform: scale(1.06); background: var(--fl-surface3); }
      .floot-mic.listening { border-color: var(--fl-accent); color: var(--fl-accent); }
      .floot-mic.recording { background: var(--fl-red); color: #fff; border-color: var(--fl-red);
        animation: floot-mic-pulse 1.4s ease-in-out infinite; }
      @keyframes floot-mic-pulse { 0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,0.4)}
        50%{box-shadow:0 0 0 7px rgba(239,68,68,0)} }

      .floot-backdrop { display: none; position: absolute; inset: 0;
        background: rgba(0,0,0,0.45); z-index: 4; }

      @media (max-width: 640px) {
        .floot-sidebar { position: absolute; z-index: 5; top: 0; bottom: 0; left: 0;
          transform: translateX(-100%); }
        .floot-sidebar.open { transform: translateX(0); }
        .floot-backdrop.open { display: block; }
        .floot-menu-btn { display: flex; align-items: center; justify-content: center; }
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
      <div class="floot-status-bar" id="floot-status">Ready.</div>
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
        <textarea class="floot-input" id="floot-input" rows="1"
          placeholder="Message Floot…" aria-label="Message"></textarea>
        <button type="button" class="floot-send" id="floot-send" aria-label="Send"></button>
      </div>
    </div>
  `;
  $parent.appendChild($root);

  const $sidebar = /** @type {HTMLElement} */ ($root.querySelector('#floot-sidebar'));
  const $backdrop = /** @type {HTMLElement} */ ($root.querySelector('#floot-backdrop'));
  const $sessionList = /** @type {HTMLElement} */ (
    $root.querySelector('#floot-session-list')
  );
  const $headerTitle = /** @type {HTMLElement} */ (
    $root.querySelector('#floot-header-title')
  );
  const $messages = /** @type {HTMLElement} */ ($root.querySelector('#floot-messages'));
  const $status = /** @type {HTMLElement} */ ($root.querySelector('#floot-status'));
  const $input = /** @type {HTMLTextAreaElement} */ (
    $root.querySelector('#floot-input')
  );
  const $send = /** @type {HTMLButtonElement} */ ($root.querySelector('#floot-send'));
  const $newBtn = /** @type {HTMLButtonElement} */ ($root.querySelector('#floot-new'));
  const $menuBtn = /** @type {HTMLButtonElement} */ ($root.querySelector('#floot-menu'));
  const $mic = /** @type {HTMLButtonElement | null} */ (
    $root.querySelector('#floot-mic')
  );
  const $meter = /** @type {HTMLElement | null} */ ($root.querySelector('#floot-meter'));
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
    $status.textContent = s;
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
      const st = sessionStatus.get(session.id) || 'idle';
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
      $sub.textContent = count ? `${count} message${count === 1 ? '' : 's'}` : 'empty';
      $meta.appendChild($name);
      $meta.appendChild($sub);
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
      session.updatedAt = Date.now();
      saveSessions();
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

  const renderHeader = () => {
    const session = getActiveSession();
    $headerTitle.textContent = session ? session.title : 'Floot';
  };

  const scrollToBottom = () => {
    $messages.scrollTop = $messages.scrollHeight;
  };

  const renderMessages = () => {
    $messages.innerHTML = '';
    const session = getActiveSession();
    if (!session) {
      const $e = document.createElement('div');
      $e.className = 'floot-empty-state';
      $e.textContent = 'No session selected.';
      $messages.appendChild($e);
      return;
    }
    if (!session.messages.length) {
      const $e = document.createElement('div');
      $e.className = 'floot-empty-state';
      $e.textContent = 'Say hello to Floot.';
      $messages.appendChild($e);
      return;
    }
    for (const msg of session.messages) {
      appendBubble(msg.role, msg.text);
    }
    scrollToBottom();
  };

  const appendBubble = (
    /** @type {'user' | 'assistant'} */ role,
    /** @type {string} */ text,
  ) => {
    const $row = document.createElement('div');
    $row.className = `floot-msg-row ${role}`;
    const $bubble = document.createElement('div');
    $bubble.className = 'floot-msg';
    $bubble.textContent = text;
    $row.appendChild($bubble);
    $messages.appendChild($row);
    return $bubble;
  };

  /** @type {HTMLElement | null} */
  let $thinkingRow = null;
  /** @type {HTMLElement | null} */
  let $streamingBubble = null;

  const showThinking = () => {
    hideThinking();
    const $row = document.createElement('div');
    $row.className = 'floot-msg-row assistant';
    $row.innerHTML = '<div class="floot-thinking"><span></span><span></span><span></span></div>';
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
  const selectSession = (/** @type {string} */ id) => {
    if (busy) return; // don't switch context mid-turn
    activeSessionId = id;
    $streamingBubble = null;
    closeSidebar();
    renderSidebar();
    renderHeader();
    renderMessages();
    setStatus('Ready.');
    $input.focus();
  };

  const deleteSession = (/** @type {FlootSession} */ session) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete "${session.title}"?`)) return;
    sessions = sessions.filter(s => s.id !== session.id);
    sessionStatus.delete(session.id);
    if (activeSessionId === session.id) {
      activeSessionId = sessions.length ? sessions[0].id : null;
      $streamingBubble = null;
    }
    saveSessions();
    renderSidebar();
    renderHeader();
    renderMessages();
  };

  const newSession = () => {
    if (busy) return;
    createSession();
    $streamingBubble = null;
    closeSidebar();
    renderSidebar();
    renderHeader();
    renderMessages();
    $input.focus();
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
  /** @type {any} */
  let activeReader = null;

  /** @type {Promise<void>} */
  let submitChain = Promise.resolve();
  /** @type {Promise<void> | null} */
  let turnPromise = null;

  // Cancel the in-flight turn (Stop button or voice barge-in). Returns a promise
  // that resolves once the turn has fully unwound, so a caller can start the next
  // turn without racing the shared streaming bubble.
  const cancelTurn = () => {
    if (!busy) return Promise.resolve();
    turnCancelled = true;
    try {
      if (activeReader) E(activeReader).return();
    } catch {
      // reader already closed
    }
    return turnPromise || Promise.resolve();
  };

  const runConverse = async (/** @type {string} */ text) => {
    let session = getActiveSession();
    if (!session) session = createSession();

    busy = true;
    turnCancelled = false;
    updateSendButton();

    session.messages.push({ role: 'user', text });
    if (session.title === DEFAULT_TITLE) session.title = autoTitle(text);
    session.updatedAt = Date.now();
    sessionStatus.set(session.id, 'streaming');
    saveSessions();
    renderSidebar();
    renderHeader();
    renderMessages();
    showThinking();
    setStatus('thinking…');

    const sessionId = session.id;
    let full = '';
    try {
      const reader = E(flootAgent).converse(text, sessionId);
      activeReader = reader;
      for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const { value, done } = await E(reader).next();
        if (done || cancelled || turnCancelled) break;
        if (value.type === 'delta') {
          full += value.text;
          ensureStreamingBubble().textContent = full;
          scrollToBottom();
        } else if (value.type === 'final') {
          full = value.text;
          ensureStreamingBubble().textContent = full;
          scrollToBottom();
        } else if (value.type === 'phase') {
          setStatus(value.phase);
        } else if (value.type === 'end') {
          break;
        } else if (value.type === 'abort') {
          sessionStatus.set(sessionId, 'error');
          setStatus(`error: ${value.reason}`);
          break;
        }
      }
      hideThinking();
      if ($streamingBubble) $streamingBubble.classList.remove('streaming');
      $streamingBubble = null;
      if (full.trim()) {
        session.messages.push({ role: 'assistant', text: full.trim() });
        session.updatedAt = Date.now();
        saveSessions();
      }
      if (sessionStatus.get(sessionId) !== 'error') {
        sessionStatus.set(sessionId, 'idle');
        setStatus(turnCancelled ? 'stopped.' : 'Ready.');
      }
      renderSidebar();
      renderMessages();
    } catch (err) {
      hideThinking();
      $streamingBubble = null;
      sessionStatus.set(sessionId, 'error');
      renderSidebar();
      renderMessages();
      setStatus(`error: ${/** @type {Error} */ (err).message}`);
    } finally {
      busy = false;
      turnCancelled = false;
      activeReader = null;
      updateSendButton();
    }
  };

  // Serialize submissions so an auto-sent voice utterance can't overlap a typed
  // message over the shared streaming bubble: each turn waits for the previous.
  const submit = (/** @type {string} */ raw) => {
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
    SILENCE_MS: 1500,
    MIN_SPEECH_MS: 400,
    PREROLL_FRAMES: 6, // ~0.5s of buffered audio prepended so onsets aren't clipped
    EMA_ALPHA: 0.01,
    THRESHOLD_MULT: 2.5,
    BARGE_MULT: 3,
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
          $input.value = last;
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
    if (text) submit(text);
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
    speaking = true;
    speechStart = Date.now();
    silenceStart = 0;
    $mic?.classList.add('recording');
    $input.value = '';
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
      try {
        if (channel) E(channel.reader).return();
      } catch {
        // already closed
      }
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
    try {
      if (channel) E(channel.reader).return();
    } catch {
      // already closed
    }
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
        noiseFloor =
          (1 - VAD.EMA_ALPHA) * noiseFloor + VAD.EMA_ALPHA * vol;
      }
      // While the assistant is replying require a louder onset (barge-in).
      const onsetThreshold = busy ? bargeThreshold : speechThreshold;
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

  // ── Initial paint ────────────────────────────────────────────────────────────
  if (!sessions.length) createSession();
  updateSendButton();
  renderSidebar();
  renderHeader();
  renderMessages();
  $input.focus();

  return () => {
    cancelled = true;
    stopMic();
  };
};
harden(flootComponent);
