#!/usr/bin/env -S uv run --quiet
# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "moonshine-voice",
# ]
# ///
"""Long-lived Moonshine transcription daemon.

Loads the model once, then serves transcription requests over a JSON-lines
protocol so callers avoid the per-utterance Python/import/model-load cost.

One-shot requests (whole WAV file on disk):
  ->  {"id": "abc", "wav": "/path/to/file.wav"}
  <-  {"id": "abc", "text": "..."} | {"id": "abc", "error": "..."}

Streaming utterances (16 kHz mono s16le PCM, base64, incremental):
  ->  {"type": "stream_start", "stream": "u1"}
  ->  {"type": "stream_audio", "stream": "u1", "pcm": "<base64>"}   (repeated)
  <-  {"stream": "u1", "partial": "..."}     (unsolicited, as text evolves)
  ->  {"type": "stream_stop",  "stream": "u1"}
  <-  {"stream": "u1", "text": "..."} | {"stream": "u1", "error": "..."}
  ->  {"type": "stream_abort", "stream": "u1"}                      (no reply)

The daemon emits {"event": "ready"} once after model load. Logs go to
stderr; stdout is reserved for the protocol.
"""
import argparse
import base64
import json
import sys
from array import array

from moonshine_voice import Transcriber, load_wav_file
from moonshine_voice.download import get_model_for_language

STREAM_SAMPLE_RATE = 16000
# How much new audio (in seconds) accumulates before we re-run incremental
# transcription and emit a partial. Matches moonshine's own default cadence.
PARTIAL_INTERVAL_S = 0.5


def pcm_to_floats(b64: str) -> list[float]:
    samples = array("h")
    samples.frombytes(base64.b64decode(b64))
    return [s / 32768.0 for s in samples]


def transcript_text(transcript) -> str:
    lines = transcript.lines if transcript is not None else []
    return " ".join(l.text for l in lines).strip()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--lang", default="en")
    args = parser.parse_args()

    model_path, model_arch = get_model_for_language(args.lang)
    transcriber = Transcriber(model_path=model_path, model_arch=model_arch)

    streams = {}
    dead_streams = {}  # stream id -> error message from a mid-stream failure

    print(json.dumps({"event": "ready"}), flush=True)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        req_id = None
        stream_id = None
        kind = None
        try:
            req = json.loads(line)
            kind = req.get("type")

            if kind == "stream_start":
                stream_id = req["stream"]
                # Disable the implicit update schedule; we drive
                # update_transcription ourselves so we can capture the
                # evolving transcript and emit partials.
                stream = transcriber.create_stream(update_interval=1e9)
                stream.start()
                streams[stream_id] = {
                    "stream": stream,
                    "audio_s": 0.0,
                    "updated_s": 0.0,
                    "partial": "",
                }
            elif kind == "stream_audio":
                stream_id = req["stream"]
                state = streams.get(stream_id)
                if state is not None:
                    floats = pcm_to_floats(req["pcm"])
                    state["stream"].add_audio(floats, STREAM_SAMPLE_RATE)
                    state["audio_s"] += len(floats) / STREAM_SAMPLE_RATE
                    if state["audio_s"] - state["updated_s"] >= PARTIAL_INTERVAL_S:
                        state["updated_s"] = state["audio_s"]
                        text = transcript_text(
                            state["stream"].update_transcription()
                        )
                        if text and text != state["partial"]:
                            state["partial"] = text
                            print(
                                json.dumps(
                                    {"stream": stream_id, "partial": text}
                                ),
                                flush=True,
                            )
            elif kind == "stream_stop":
                stream_id = req["stream"]
                state = streams.pop(stream_id, None)
                if state is None:
                    error = dead_streams.pop(stream_id, "unknown stream")
                    print(
                        json.dumps({"stream": stream_id, "error": error}),
                        flush=True,
                    )
                    continue
                transcript = state["stream"].stop()
                state["stream"].close()
                text = transcript_text(transcript)
                print(json.dumps({"stream": stream_id, "text": text}), flush=True)
            elif kind == "stream_abort":
                stream_id = req["stream"]
                dead_streams.pop(stream_id, None)
                state = streams.pop(stream_id, None)
                if state is not None:
                    state["stream"].close()
            else:
                req_id = req["id"]
                audio_data, sample_rate = load_wav_file(req["wav"])
                transcript = transcriber.transcribe_without_streaming(
                    audio_data, sample_rate
                )
                text = " ".join(l.text for l in transcript.lines).strip()
                print(json.dumps({"id": req_id, "text": text}), flush=True)
        except Exception as exc:  # keep serving; report the error to the caller
            print(f"[moonshine_daemon] {exc!r}", file=sys.stderr, flush=True)
            if req_id is not None:
                print(json.dumps({"id": req_id, "error": str(exc)}), flush=True)
            elif stream_id is not None:
                streams.pop(stream_id, None)
                if kind == "stream_stop":
                    print(
                        json.dumps({"stream": stream_id, "error": str(exc)}),
                        flush=True,
                    )
                else:
                    # Remember the failure; reported when stream_stop arrives.
                    dead_streams[stream_id] = str(exc)

    return 0


if __name__ == "__main__":
    sys.exit(main())
