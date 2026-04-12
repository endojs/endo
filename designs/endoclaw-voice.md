# EndoClaw: Voice Input

| | |
|---|---|
| **Created** | 2026-03-03 |
| **Updated** | 2026-03-03 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |
| **Parent** | [endoclaw](endoclaw.md) |

## Summary

Voice input in the Chat UI using the Web Speech API or Whisper
transcription. The user speaks into their microphone; the transcribed
text is sent as a normal message to the agent's inbox. This is a UI
feature, not a capability — it does not grant the agent any new authority.

## How It Works

### Option A: Web Speech API (browser-native)

1. Chat UI adds a microphone button to the message input area.
2. On click, `SpeechRecognition` listens and streams interim results
   to the input field.
3. On final result, the transcribed text populates the message input.
4. User reviews and sends (or the UI auto-sends on silence timeout).

Pros: Zero dependencies, works in Chrome and Edge, no server needed.
Cons: Requires internet (Chrome sends audio to Google), limited language
support, no offline.

### Option B: Local Whisper transcription

1. Familiar bundles or downloads a Whisper model (tiny/base).
2. Electron main process captures audio via `desktopCapturer` or a
   native module.
3. Transcription runs locally via `whisper.cpp` or `@xenova/transformers`.
4. Transcribed text is injected into the Chat UI message input.

Pros: Fully offline, privacy-preserving, better accuracy.
Cons: Requires native binary or WASM, model download (~75MB for base),
higher CPU usage.

### Option C: Daemon-side transcription

1. Chat UI captures audio as a blob and sends it over WebSocket.
2. Daemon worker runs Whisper transcription.
3. Transcribed text is delivered as a message to the agent's inbox.

Pros: Offloads compute from UI, works for remote/Docker setups.
Cons: Latency, requires daemon to bundle Whisper.

## Endo Idiom

Voice input is a UI concern, not a capability concern. The transcribed
text enters the system as a normal message — the agent cannot
distinguish voice input from typed input. No new capabilities, formula
types, or daemon changes are needed for Option A.

For Options B and C, the audio capture and transcription machinery lives
outside the capability boundary. The agent never receives raw audio —
only text.

## Depends On

- Chat UI (packages/chat) for Option A
- Familiar (Electron) for Option B
- Daemon worker infrastructure for Option C
- No other EndoClaw designs required
