# @endo/floot

A streaming LLM agent harness for the Endo daemon, plus the two voice caplets
that make it a hands-free voice assistant.

- **Factory** (`agent.js`) — a fae-like factory that owns one guest per chat
  session and exposes `converse(text) -> replyReader`, a pull-based stream of
  reply-token deltas (`src/stream.js`).
- **Voice caplets** (`voice/`) — two independent, swappable daemon objects:
  - `floot-stt` — speech-to-text via [Moonshine](https://github.com/moonshine-ai/moonshine)
    (`voice/audio-server-caplet.mjs`): `transcribe(audioReader) -> textReader`.
  - `floot-tts` — text-to-speech via [piper](https://github.com/rhasspy/piper)
    (`voice/tts-server-caplet.mjs`): `synthesize(textReader) -> audioReader`.

The browser UI lives in [`@endo/chat`](../chat); a Chat Space looks these three
objects up by pet-name and streams to/from them.

## Demo dependencies

Everything below must be present on the machine running the Endo daemon (the
caplets are unconfined and spawn these as subprocesses).

| Dependency | Used by | Notes |
| --- | --- | --- |
| Endo daemon + `endo` CLI | everything | Built from this monorepo (`yarn build`); start with `endo start`. |
| `ANTHROPIC_API_KEY` | factory | Anthropic API key for the LLM. Passed via a capability handle, never stored in caplet env. |
| [`uv`](https://docs.astral.sh/uv/) | `floot-stt` | Runs `voice/moonshine_daemon.py`, which is PEP-723 self-contained — `uv` installs `moonshine-voice` and downloads the model on first run. No project Python env needed. |
| [`piper`](https://github.com/rhasspy/piper) binary | `floot-tts` | Standalone TTS engine. Point `FLOOT_TTS_BINARY` at it (default `piper` on PATH). |
| A piper voice model | `floot-tts` | A `<voice>.onnx` plus its companion `<voice>.onnx.json` (the `.json` supplies `audio.sample_rate`). `FLOOT_TTS_MODEL` is the absolute path to the `.onnx`. |

### Getting a piper voice

Download a voice and its companion config from the official
[`rhasspy/piper-voices`](https://huggingface.co/rhasspy/piper-voices) mirror.
For `en_GB-alba-medium`:

```sh
mkdir -p ~/.floot/piper-voices && cd ~/.floot/piper-voices
base=https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/alba/medium
curl -LO $base/en_GB-alba-medium.onnx
curl -LO $base/en_GB-alba-medium.onnx.json
```

The voice id encodes its path: `en_GB-alba-medium` → `en/en_GB/alba/medium/`.

## Setup

1. **Start the daemon** (once): `endo start`.

2. **Provision the factory.** Copy `.env.example` to `.env`, fill in
   `ANTHROPIC_API_KEY` (and optionally `FLOOT_MODEL`), then:

   ```sh
   ./setup-factory.sh           # or: ./setup-factory.sh path/to/.env
   ```

   Creates the pinned `floot-factory` and a default session.

3. **Provision the voice caplets.** Ensure `uv`, `piper`, and a voice model are
   present, then:

   ```sh
   FLOOT_TTS_MODEL=~/.floot/piper-voices/en_GB-alba-medium.onnx ./setup-voice.sh
   ```

   Or with an `.env` that sets `FLOOT_TTS_MODEL` (plus optional
   `FLOOT_TTS_BINARY`, `FLOOT_TTS_SPEED`, `FLOOT_STT_LANG`):

   ```sh
   ./setup-voice.sh
   ```

   Stands up `floot-stt` (warms up Moonshine) and `floot-tts`.

4. **Open the UI.** In [`@endo/chat`](../chat): `yarn dev`. Create a Chat Space
   and set its object paths to `floot-factory`, STT path `floot-stt`, TTS path
   `floot-tts`.

## Swapping an implementation

`floot-stt` and `floot-tts` are separate daemon formulas, each behind its own
pet-name. To use a different engine, provision a replacement object exposing the
same interface (`transcribe` / `synthesize`) under the same pet-name — no change
to the factory or UI is required.
