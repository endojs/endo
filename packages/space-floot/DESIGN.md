# Floot → confined Preact: design and migration plan

This document records the full plan for moving Floot's UI from an imperative-DOM
chat component (`packages/chat/floot-component.js`) to a confined Preact space
(`@endo/space-floot`) matching the migrated spaces (peers, whylip,
file-explorer), folding the standalone Transcription/Voice space into Floot, and
the supporting non-UI work (daemon provisioning, controller auto-detection,
backend review fixes).

It is the source of truth for the staged rewrite.
Update it as decisions change.

## Goals

- Author Floot's UI as a pure confined Preact component, mounted through chat's
  sanitizing `renderConfined`, exactly like `@endo/space-peers`.
- Fold the Transcription/Voice space into Floot behind a debug/settings button;
  remove the standalone `voice-component.js` and its `'voice'` space mode.
- Provision every Floot daemon object under a single `floot/` inventory
  directory so the top-level inventory stays clean; the controller picker
  auto-detects the factory (and STT/TTS) from that directory.
- Preserve all current behavior: streaming replies, the background-turn registry
  (turns survive leaving a space) with reattach, the sidebar "thinking"
  indicator, per-session token accounting, mic capture with noise-floor VAD,
  spoken replies with barge-in, the pause-grace endpointer, and session presets.

## The confined-Preact constraint (the crux)

Chat's confined renderer (`packages/chat/setup-preact-container.js`, built on
`@endo/preact-container`) sanitizes the whole vnode tree: it strips refs, gives
event handlers a frozen `SafeEvent` facade with no real DOM node, and denies
ambient browser globals.
A confined component therefore **cannot** use the APIs Floot's voice stack is
built on:

- `navigator.mediaDevices.getUserMedia` (mic capture)
- `AudioContext` / `AnalyserNode` / `ScriptProcessorNode` (VAD analysis, PCM
  capture, Web-Audio playback of TTS)
- `requestAnimationFrame` (the VAD sampling loop)
- `document` / `window` / direct DOM nodes (e.g. the live `<textarea>`,
  `window.confirm`)

So the rewrite is a split, not a port:

- **Host wrapper** — `packages/chat/floot-component.js`, ordinary (unconfined)
  chat code with full browser APIs.
  It owns the imperative engine and the capabilities, and mounts the view.
- **Confined view** — `@endo/space-floot`'s `FlootApp` and sub-components.
  Pure Preact (`h()` vnodes + hooks), no browser APIs, driven entirely by a
  host-owned `controller` prop (pure-data snapshots + callbacks).

### Contingency: if the split is too restrictive

If keeping the view fully confined proves impractical (for example, the mic
meter or live transcript needs lower-latency coupling to the audio engine than a
snapshot/subscribe controller can provide), the fallback options, least-invasive
first, are:

1. **Host-rendered overlay for audio-only UI.**
   Keep `FlootApp` confined for the chat surface, but let the host wrapper render
   the mic button + VAD meter + live-transcript line as a small imperative
   overlay positioned over the confined tree (the host already owns that DOM).
   The confined view leaves a placeholder slot.
2. **Unconfined mount for the whole Floot space.**
   Mount `FlootApp` with a plain Preact `render` (not `renderConfined`) from the
   host wrapper, accepting that Floot is a trusted first-party space and does not
   need the sanitizer.
   This still gives us the Preact component model and matches "the other spaces"
   in authoring style, just not in confinement.
3. **Relax the renderer for a marked subtree.**
   Extend `@endo/preact-container` with an escape hatch (a sanctioned `ref` or a
   host-portal element) for the audio controls only.
   Most invasive; only if 1–2 are insufficient.

The default is the full split (host engine + confined view).
We adjust to option 1 → 2 → 3 only if a concrete need surfaces during stage 2/3,
and record the change here.

## Audio API usage plan

Every browser/audio API Floot uses, and where it lives after the rewrite.
All of these stay in the **host wrapper** (`floot-component.js`), never in the
confined view.

| API / global | Used for | Home |
| --- | --- | --- |
| `navigator.mediaDevices.getUserMedia` | open the mic (16 kHz mono) | host audio controller |
| `MediaStream` / `MediaStreamTrack.stop()` | mic lifecycle / teardown | host audio controller |
| `AudioContext` (mic) + `AnalyserNode` | RMS for noise-floor VAD | host audio controller |
| `ScriptProcessorNode` (or `AudioWorklet`) | capture PCM frames to stream to STT | host audio controller |
| `requestAnimationFrame` | VAD sampling loop | host audio controller |
| `AudioContext` (playback) + `AudioBufferSourceNode` | play streamed s16le PCM TTS chunks | host audio controller |
| `window.setTimeout` / `clearTimeout` | pause-grace endpointer, replay timers | host audio controller |
| `document.createElement` / mount node | the `renderConfined` mount target | host wrapper |
| `window.confirm` | delete-session confirmation | host wrapper (or a confined modal — preferred) |

The host wrapper exposes these to the confined view only as **callbacks and
pure-data state** on the controller (see the contract below).
PCM bytes, `AudioBuffer`s, `MediaStream`s, and DOM nodes never cross into the
confined view; the view sees booleans (`micActive`, `speaking`), numbers (VAD
meter level, token totals), and strings (status, transcript text).

The existing audio engine to move out of `floot-component.js` (current line
references on the pre-rewrite file):

- mic capture + VAD: `startMic` / `stopMic` / `vadLoop` / `beginUtterance` /
  `endUtterance` / `abortUtterance` / `computeRms` / `paintMeter` and the `VAD`
  tuning constants (incl. the `SILENCE_MS` + `RESUME_GRACE_MS` pause-grace logic).
- mic→STT streaming: `makeAudioChannel` (browser side) + `drainTranscript`.
- TTS playback: `playAudioStream` / `stopTts` / `makeTextFeed` / `ttsAudible` and
  the `ttsSources` / `ttsPlaybackId` playback bookkeeping.
- the module-level background-turn registry (`inFlightTurns`, `startFlootTurn`)
  and `attachTurnView` — these consume the reply reader over CapTP (allowed in a
  confined component) but stay host-side because they outlive a mount and drive
  TTS; the view subscribes to their state.

## Controller ↔ view contract

The host wrapper builds one `controller` per mount and passes it to
`FlootApp`.
The controller is the model; `FlootApp` is the view.

```
controller = {
  // --- reactive state (pure data; re-read after every `change` notification) ---
  getState() => {
    sessions: Array<{ id, title, createdAt, presetId, model, streaming, error }>,
    activeSessionId: string | null,
    presets: Array<{ id, title, description }>,
    models: Array<{ id, title, description, default }>,  // selectable for a new session
    messages: Array<FlootMessage>,   // active session transcript (history + live turn)
    streamingText: string,           // in-progress assistant bubble, '' when idle
    phase: string,                   // 'thinking' | 'using tools' | ...
    busy: boolean,                   // a turn is streaming for the active session
    status: string,                  // status-bar text
    usage: { inputTokens, outputTokens } | null,
    // voice (all booleans/numbers/strings — no audio objects):
    voice: {
      hasMic, hasTts, micActive, speaking, ttsEnabled, ttsSpeaking,
      meterLevel, meterNoise, meterThreshold, transcript,
    },
    settingsOpen: boolean,
  },
  subscribe(listener) => unsubscribe,   // listener() fires on any state change

  // --- callbacks (the view calls these; the host does the imperative work) ---
  send(text), stop(),                   // compose / barge-in stop
  selectSession(id), newSession(presetId?, model?), renameSession(id, title),
  deleteSession(id),
  toggleMic(), toggleTts(), replayMessage(text),
  toggleSettings(), setInput(text),     // input is host-held for IME/caret safety
}
```

Notes:

- `FlootApp` re-renders on `subscribe` notifications via a tiny
  `useReducer(c => c + 1, 0)` + a mount-once effect; it reads `getState()` each
  render.
  The controller instance is stable for the mount (object props can't be effect
  deps under the sanitizer, so the subscribe effect uses `[]`).
- The compose `<textarea>` is the one input that benefits from being host-owned
  (caret/IME); decide in stage 3 whether the view renders a confined input bound
  to `controller.setInput` or the host overlays a real textarea.
  Start with a confined controlled input; fall back to a host overlay only if
  caret/IME misbehaves.

## Component decomposition (`@endo/space-floot/src`)

- `FlootApp.js` — shell + subscription glue; composes the pieces.
- `SessionSidebar.js` — session list, status dots (from `streaming`/`error`),
  preset pills, new/rename/delete controls, mobile drawer.
- `MessageList.js` — history + live turn: user/assistant/mail bubbles, tool rows
  (call + result), streaming caret, thinking indicator, replay buttons.
- `ComposeBar.js` — input, send/stop button, mic + speaker toggles, VAD meter.
- `SettingsPanel.js` — the folded-in transcription/debug surface: live transcript
  view, mic/VAD meter detail, STT/TTS object info, token totals.
- (hooks live inline in `FlootApp` — `useController(controller)` for the
  subscribe/snapshot glue.)

## Non-Preact (and cross-package) work

### Provisioning into a `floot/` directory

`floot-factory-setup.js` and `voice-setup.js` place every object under a single
`floot/` inventory directory instead of polluting the top level.

Daemon API facts that shape this (from `packages/daemon/src/types.d.ts` and
`packages/daemon/AGENTS.md`):

- `makeUnconfined` `resultName` and `storeValue`/`storeLocator` accept
  `string | string[]`, so caplets and values can be written straight to
  `['floot', name]`.
- `provideHost` / `provideGuest` take a single pet-name (not a path), so the
  factory host is created top-level then `move`d into `['floot', name]`
  (`move` accepts path arrays).
- `makeDirectory('floot')` creates the directory; guard with `has('floot')` for
  idempotency on re-provision.

Target layout:

- `floot/controller` — the factory (pinned via `@pins`).
- `floot/controller-handle`, `floot/controller-profile` — the factory host +
  its profile.
- `floot/llm-provider` — the provider config value (off the top level).
- `floot/stt`, `floot/tts` — the voice caplets.

### Controller auto-detection

When creating/configuring a Floot space, the picker lists the `floot/` directory
and selects the controller automatically rather than requiring a typed pet-name
path.
Detection: prefer a well-known name (`floot/controller`); otherwise probe entries
with `E(obj).__getMethodNames__()` and pick the one exposing
`createSession`/`listSessions`.
STT/TTS auto-detected as `floot/stt` / `floot/tts`.
This lives in `add-space-modal.js` / `spaces-gutter.js` / the new wrapper.

### Remove the standalone Voice space

Delete `packages/chat/voice-component.js`, the `'voice'` mode dispatch in
`chat.js`, and the `'voice'` entries in `spaces-gutter.js` / `add-space-modal.js`.
Transcription lives only inside Floot's settings panel.

### Backend review fix (`makeExo`)

From the `kriscendobot` panel review (must-fix + should-fix), independent of the
UI rewrite:

- `FlootSession` facet → `makeExo` + `M.interface()` (gains
  `__getMethodNames__()` and guards), matching `FlootFactory`.
- `TtsServer` / `AudioServer` caplets → `makeExo`.
- harden `makeChunker` / `makeAudioChannel` internal returns; document the
  `setOnClose` call-order on `makeTextChannel`.

Use permissive guards (`M.call(M.any())...` / `M.callWhen().returns(M.any())`,
correct arities) because the daemon path is not runtime-tested here.

### Retire the old imperative component

Once `FlootApp` + the host wrapper are in place and the chat dispatch points at
them, delete the imperative body of `floot-component.js` (keeping only the thin
wrapper) and remove now-dead helpers.

## Migration stages (each a build-verified commit)

1. **Scaffold `@endo/space-floot`** — done (`63bcd511`): package, `floot.css`,
   `FlootApp` scaffold.
2a. **Confined view layer** — done (`8ed55669`): the pure `FlootApp` +
   sub-components (`SessionSidebar`, `MessageList`, `ComposeBar`,
   `SettingsPanel`, `types.js`), authored against the controller contract.
2b/3. **Host controller + swap** — done: `packages/chat/floot-component.js` is
   now a thin host wrapper that owns the CapTP resolution, the module-level
   background-turn registry, the mic/VAD engine, and TTS playback, and exposes
   them to the view as a single `controller` (pure-data `getState()` snapshots
   plus callbacks). The whole imperative DOM body (sidebar/message/compose/modal
   rendering, inline `<style>`) is gone; `floot.css` is bundled host-side in
   `main.js` like `peers.css`. The chat dispatch (`chat.js` `mode === 'floot'`)
   is unchanged — the wrapper keeps the same
   `flootComponent($parent, rootPowers, profilePath, onProfileChange, audioPath, ttsPath)`
   signature and `() => cleanup` return. Verified by `node --check`, the chat
   `vite build`, and `tsc`/eslint clean on the wrapper (apart from two
   pre-existing patterns shared with the original file).
4. **`floot/` provisioning + auto-detect** — done (`e0aa258a`):
   `floot-factory-setup.js` / `voice-setup.js` provision every object under a
   `floot/` directory (factory at the well-known `floot/controller`, pinned;
   `floot/llm-provider`, `floot/stt`, `floot/tts`) via the daemon's path-array
   APIs. The add-space picker's `detectFlootObjects()` prefers
   `floot/controller` (else probes entries via `__getMethodNames__()` for
   `createSession`/`listSessions`) and pre-fills the controller path + STT/TTS
   fields; manual entry still works.
5. **Remove the standalone Voice space** — done (`49965722`): deleted
   `voice-component.js`, its dispatch/import, and every `'voice'` mode reference
   in `chat.js` / `spaces-gutter.js` / `add-space-modal.js`. Transcription lives
   only in Floot's settings panel.
6. **`makeExo` backend fix** — done (`56f93aa4`): the FlootSession facet and the
   STT/TTS caplets are `makeExo` + `M.interface()` (guards +
   `__getMethodNames__()`); internal channel returns hardened and the
   `setOnClose` call-order documented.

All six stages are landed. The daemon-side stages (4 setup scripts, 6 caplets)
are verified by `node --check`, `tsc`, and eslint only — they are not
runtime-tested in this environment and need a live `endo run` smoke test.

### Sticky-bottom scrolling (host responsibility)

The confined view cannot touch DOM scroll positions — `renderConfined` strips
every `ref`. The old component read `$messages.scrollTop` directly; the wrapper
now keeps the transcript pinned to the bottom from the **host** side, over the
mount node it already owns: a capture-phase `scroll` listener on `$mount` tracks
a "near the bottom" flag (scroll does not bubble, but the capture phase still
reaches ancestors), and a `MutationObserver` nudges `.floot-messages` to the
bottom after each render while that flag holds. This is a host
DOM-housekeeping concern, not a rendered-UI overlay, so it stays clear of the
view contract (none of the contingency options were needed).

The compose `<textarea>` auto-grows up to its `max-height` via CSS
`field-sizing: content`. The old host code resized it imperatively in JS on every
input; a confined view cannot touch the DOM, so `floot.css` reproduces the
grow-to-fit purely in CSS (restored in the post-review cleanup, commit
`3b2cbafc`).

## Verification and gaps

- CI covers lint, type-check, and the chat `vite build` (the integration smoke
  for "Floot mounts in the Preact shell").
- Mic / Web-Audio / VAD paths are **not** runtime-verifiable in this environment;
  they need a browser smoke test: mic → transcript → reply → spoken audio with
  barge-in, the pause-grace endpointer, background-turn reattach across a
  space switch, and the settings/transcription panel.
- The `floot/`-directory provisioning runs only against a live daemon (no
  automated test), so it is validated by `node --check` + lint here and a manual
  `endo run` there.
