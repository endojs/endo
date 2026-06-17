# Floot roadmap

Outstanding improvements, carried over from the original standalone Floot app
and re-scoped for the Endo spaces UI (`@endo/chat`'s `floot-component.js`) plus
the factory/caplets in this package. Ordered roughly by impact.

File paths marked _(original app)_ refer to the pre-Endo codebase and are kept
for context; the equivalent code in this monorepo lives in `agent.js`,
`voice/`, and `@endo/chat`.

## Recently shipped (spaces UI)

- **Sticky-bottom scroll** — transcript follows new content only while the
  reader is at the bottom; scrolling up is no longer fought.
- **No TTS over a live recording** — starting a recording silences any reply
  audio still playing or scheduled ahead.
- **Compose box never disabled** — already satisfied; the spaces text input is
  never `disabled`.
- (From the original app: "bing bong" voice commands, empty-transcript barge-in
  confirmation, and the Piper TTS provider.)

## Interactivity

### Parallel tool calls
The agent loop executes tool calls sequentially. The Anthropic API can emit
multiple tool calls in one turn — run them concurrently.

### Interactive question-asking
The assistant can't present structured multiple-choice questions — there's no UI
affordance, so it has to flatten choices into prose and parse a freeform reply.
Add a way for the model to offer discrete options (labels + descriptions) the
user can pick from, rendered in the transcript and answerable by voice or tap.

## Tool surface

Two tools (`eval_js`, `run_shell`) is thin. Add:

- `read_file`, `write_file`, `edit_file` — avoid shelling out to `cat`/`sed`
- `glob`, `grep` — precise lookup without spawning shell pipelines
- `web_fetch`, `web_search` — grounding

Also: stream long tool output back to the UI incrementally rather than as a
single final blob.

## Reliability

### Token & cost accounting
Anthropic streams `message_delta.usage` but it isn't read. Capture it, persist
per-session totals, and surface them in the UI.

## Speech-to-text

### Reduce false-positive transcripts (FPR)
Recognizers hallucinate short phrases ("Thank you for watching", "♪", "...") on
near-silence and low-level noise. Floot's VAD gates the mic and a known-phrase
filter drops exact-match junk, but noise bursts can still produce novel
fragments. Moonshine helps but still emits short fragments on bluetooth-headphone
noise floors. Mitigations worth landing (backend-agnostic duration/phrase
filters regardless):

- Bias the decoder toward emitting nothing on silence.
- Evaluate backends with lower FPR (Moonshine/Parakeet weren't trained on
  subtitle data; Calm-Whisper claims large FPR reductions at small WER cost).

Benchmark: [sachaarbonel/whisper-hallucinations](https://huggingface.co/datasets/sachaarbonel/whisper-hallucinations).

### Streaming STT for iOS Safari
iOS Safari records mp4/aac, which can't be live-decoded from a pipe — those
clients silently fall back to batch transcription (no partials, latency scales
with utterance length). Options: capture raw PCM via an AudioWorklet instead of
MediaRecorder on those clients, or remux fragmented mp4 server-side.

## Voice

### Working/thinking audio cue
While the agent is actively working, play an ambient sound (e.g. soft flute
music) on a loop, stopping when the turn finishes — an at-a-glance audio signal
that the agent is busy versus idle. The spaces UI currently shows a visual
"thinking" indicator only.

### Wake word
"Hey Floot"-style activation so the mic can stay armed without false-triggering
on every passing sound. Picovoice Porcupine and openWakeWord both run locally.

### Premature turn-start cuts off the user (bug)
The assistant can start responding while the user is still mid-utterance during a
long, pause-heavy statement. The endpointer treats an intra-thought pause as
end-of-turn, finalizes early, and kicks off a response — interrupting the user
and **discarding the rest of what they were saying**. Investigate endpointing /
silence-threshold tuning, holding the turn open across short pauses, and
buffering late speech instead of dropping it.

### Smarter barge-in recovery
Barge-in flags the session so the model's next turn knows its previous reply was
cut off, but the dropped text itself is gone. Richer paths:

- **Queue continuation** — let the current turn finish in the background
  (without TTS) and queue its remaining text so the assistant resumes once the
  interjection is processed.
- **Resume from interruption point** — capture how far TTS had played and
  continue from there rather than starting a fresh turn.

### Better TTS providers
Piper is shipped. Add:

- **Kokoro** — small (~80M), excellent quality, local.
- **ElevenLabs** — cloud benchmark for naturalness, for users who don't mind the
  dependency.

## Multi-modal input

Drag or paste screenshots into a session. Vision-capable models already accept
image content blocks — the transcript needs to render and round-trip them. Pair
with a `screenshot` tool so the assistant can look at your screen on request.

## Cross-session memory

Per-session history persists; nothing carries between sessions. Add a global
scratchpad the assistant can read and write ("remember I prefer X") — what makes
Floot feel like *your* assistant rather than a clean-slate chatbot every time.

## Background & scheduled prompts

Trigger a session on a schedule ("every morning at 8, summarize unread mail") or
in response to an external event. Floot speaks the result, sends a notification,
or both — fits the voice-first ergonomics.

## Remote access

A Tailscale-friendly bind plus auth token would let you talk to Floot from your
phone over your tailnet. Bonus: an iOS Shortcut that records audio and POSTs to
the transcribe endpoint.

## CLI mode

A terminal client (text in/out) for piped or SSH workflows where opening a
browser isn't worth it.

## Client UI

### CapTP transport between client and server
The UI↔server link is hand-rolled JSON over a WebSocket _(original app)_.
Server↔daemon already speaks CapTP, so the client is the odd one out. Moving the
UI link to CapTP would replace the command/event switchboard with remote object
references (promise pipelining, capability-scoped access). Caveat: the current
CapTP/eventual-send model is request/response and does **not** cover Floot's
streaming needs — live partial transcripts, token deltas, and audio frames are
latency-critical. Any move here must keep a streaming channel (or extend CapTP
with stream caps) rather than collapse everything into method calls.

### Mobile text input intermittently not tappable (bug)
On mobile, the text input sometimes can't be focused — tapping does nothing,
then later works. Likely state-dependent (an overlay / `pointer-events` /
z-index intercepting taps during certain states). Investigate any overlay that
could intercept taps on touch.

## Dev ergonomics

### Structured logging
Replace `console.log` with a structured logger. Useful once tool calls multiply
and we want to grep traces.

### Dry-run model
A provider that echoes the prompt back without calling an LLM, for testing UI
changes without burning tokens.
