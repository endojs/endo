// @ts-check
// M2a: the audio server object as a daemon-managed *unconfined* caplet.
//
// makeUnconfined loads this module by filesystem path into a Node worker and
// calls `make(powers, context, { env })`. Being unconfined, the worker has full
// Node — so the caplet spawns the moonshine python STT subprocess itself and
// exposes the streaming interface over CapTP:
//
//   audioServer.transcribe(audioReader) -> textReader
//
// textReader yields replace-style transcript events (NOT deltas):
//   { type: 'phase', phase } | { type: 'partial', text } |
//   { type: 'final', text } | { type: 'end' } | { type: 'abort', reason }
// where `text` is always the full transcript so far, since moonshine partials
// are cumulative and revise earlier words mid-stream.
//
// Named into the daemon inventory via makeUnconfined's resultName, it is then
// reachable by pet-name lookup from any client (the chat browser for M2b).
// See §11 of docs/endo-daemon-integration.md and [[project-voice-space-m2]].
//
// Self-contained on purpose: the daemon worker is plain Node and cannot load
// Floot's .ts (no tsx). It mirrors src/endo/stream.ts + src/endo/audio-server.ts
// + src/stt/moonshine.ts, reduced to exactly what transcribe needs. The wire
// shape stays identical so the in-process M1 path and this caplet are
// interchangeable from the caller's view.

import { E } from '@endo/eventual-send';
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import { makeBufferedReader } from '@endo/exo-stream/buffered-channel.js';

// `transcribe` is synchronous (returns the transcript reader immediately, then
// streams), so it is guarded with `M.call`. Guards are permissive — the daemon
// path is not runtime-tested here.
const AudioServerInterface = M.interface('AudioServer', {
  transcribe: M.call(M.any()).returns(M.remotable()),
  help: M.call().returns(M.string()),
});

// ── Minimal moonshine driver (plain JS port of MoonshineSTTProvider) ────────
const makeMoonshine = ({ scriptPath, cwd, uv = 'uv', lang = 'en' }) => {
  let child = null;
  let readyPromise = null;
  let stdoutBuffer = '';
  const pendingStreams = new Map(); // stream -> { resolve, reject }
  const partialHandlers = new Map(); // stream -> (text) => void

  const ensure = () => {
    if (readyPromise) return readyPromise;
    readyPromise = new Promise((resolve, reject) => {
      const proc = spawn(uv, ['run', '--quiet', scriptPath, '--lang', lang], {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      child = proc;
      stdoutBuffer = '';
      let ready = false;

      const handleLine = line => {
        if (!line) return;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          return;
        }
        if (msg.event === 'ready') {
          ready = true;
          resolve(undefined);
          return;
        }
        if (msg.stream && msg.partial !== undefined) {
          const h = partialHandlers.get(msg.stream);
          if (h) h(msg.partial);
          return;
        }
        if (msg.stream) {
          const req = pendingStreams.get(msg.stream);
          if (!req) return;
          pendingStreams.delete(msg.stream);
          if (msg.error !== undefined) {
            req.reject(new Error(`moonshine: ${msg.error}`));
          } else {
            req.resolve((msg.text ?? '').trim());
          }
        }
      };

      proc.stdout.setEncoding('utf-8');
      proc.stdout.on('data', chunk => {
        stdoutBuffer += chunk;
        let nl = stdoutBuffer.indexOf('\n');
        while (nl !== -1) {
          const line = stdoutBuffer.slice(0, nl).trim();
          stdoutBuffer = stdoutBuffer.slice(nl + 1);
          handleLine(line);
          nl = stdoutBuffer.indexOf('\n');
        }
      });

      proc.stderr.setEncoding('utf-8');
      proc.stderr.on('data', text => {
        const t = `${text}`.trim();
        if (t) console.error(`[audio-caplet][stt] ${t}`);
      });

      const fail = err => {
        if (child === proc) {
          child = null;
          readyPromise = null;
        }
        for (const req of pendingStreams.values()) req.reject(err);
        pendingStreams.clear();
        partialHandlers.clear();
        if (!ready) reject(err);
      };
      proc.on('error', err =>
        fail(new Error(`moonshine failed to start: ${err.message}`)),
      );
      proc.on('exit', (code, signal) =>
        fail(new Error(`moonshine exited (code ${code}, signal ${signal})`)),
      );
    });
    return readyPromise;
  };

  const sendLine = payload => {
    if (!child?.stdin?.writable) return false;
    child.stdin.write(`${JSON.stringify(payload)}\n`);
    return true;
  };

  return {
    warmup: ensure,
    dispose: () => {
      child?.kill();
      child = null;
      readyPromise = null;
    },
    // onPartial receives the cumulative transcript so far.
    startUtterance: onPartial => {
      const stream = randomUUID();
      let closed = false;
      if (!sendLine({ type: 'stream_start', stream })) {
        throw new Error('moonshine is not running');
      }
      if (onPartial) partialHandlers.set(stream, onPartial);
      return {
        // Incoming audio frames are already base64 PCM (the bytes-event wire
        // form) — forward straight through to the python protocol.
        writePcmBase64: b64 => {
          if (closed || !b64) return;
          sendLine({ type: 'stream_audio', stream, pcm: b64 });
        },
        finish: () => {
          if (closed) return Promise.reject(new Error('utterance closed'));
          closed = true;
          partialHandlers.delete(stream);
          return new Promise((resolve, reject) => {
            pendingStreams.set(stream, { resolve, reject });
            if (!sendLine({ type: 'stream_stop', stream })) {
              pendingStreams.delete(stream);
              reject(new Error('moonshine is not running'));
            }
          });
        },
        abort: () => {
          if (closed) return;
          closed = true;
          partialHandlers.delete(stream);
          sendLine({ type: 'stream_abort', stream });
        },
      };
    },
  };
};

// ── Minimal text-side stream channel (Far StreamReader) ─────────────────────
// Text events carry the *full current transcript* (replace semantics), not
// deltas: moonshine partials are cumulative and freely revise earlier words
// (e.g. inserting punctuation), so an append-only wire can't represent them.
// `setOnClose` aborts moonshine's in-flight utterance when the consumer stops.
const makeTextChannel = () => {
  const { push, reader, setOnClose } = makeBufferedReader();
  const writer = {
    partial: text => push({ type: 'partial', text: `${text}` }),
    final: text => push({ type: 'final', text: `${text}` }),
    setPhase: phase => push({ type: 'phase', phase: `${phase}` }),
    end: () => push({ type: 'end' }),
    abort: reason => push({ type: 'abort', reason: `${reason}` }),
  };
  // `setOnClose` must be wired by the caller AFTER construction (pump() calls it
  // once it has an utterance to abort); the buffered reader tolerates a late
  // hook because the consumer cannot `return()` before the first `next()`.
  return harden({ writer, reader, setOnClose });
};

// Pump audio frames into moonshine and stream transcript events. Each partial
// is the full evolving transcript; forward it as-is so the UI can re-render
// (and absorb moonshine's mid-stream revisions) instead of accreting deltas.
const pump = async (moonshine, audioReader, writer, setOnClose) => {
  let sink = null;
  try {
    // Respawn moonshine if a previous run crashed (ensure is idempotent), so a
    // single daemon crash doesn't brick the caplet until it's re-provisioned.
    await moonshine.warmup();
    sink = moonshine.startUtterance(partial => writer.partial(partial));
    const utterance = sink;
    setOnClose(() => utterance.abort());
    writer.setPhase('listening');
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const { value, done } = await E(audioReader).next();
      if (done) break;
      if (value.type === 'bytes') sink.writePcmBase64(value.b64);
      else if (value.type === 'end') break;
      else if (value.type === 'abort') {
        sink.abort();
        writer.abort(value.reason);
        return;
      }
    }
    writer.setPhase('transcribing');
    writer.final(await sink.finish());
    writer.end();
  } catch (err) {
    if (sink) sink.abort();
    writer.abort(err instanceof Error ? err.message : String(err));
  }
};

// Unconfined caplet entry point. env carries the moonshine wiring:
//   FLOOT_STT_SCRIPT  absolute path to moonshine_daemon.py (PEP-723 self-contained)
//   FLOOT_PROJECT_DIR cwd for the `uv run` subprocess
//   FLOOT_STT_UV      uv binary (default "uv")
//   FLOOT_STT_LANG    language (default "en")
/**
 * @param {object} _powers
 * @param {any} context daemon caplet context (whenCancelled for teardown)
 * @param {{ env?: Record<string, string | undefined> }} [opts]
 */
export const make = async (_powers, context, { env = {} } = {}) => {
  const scriptPath = env.FLOOT_STT_SCRIPT;
  const cwd = env.FLOOT_PROJECT_DIR;
  if (!scriptPath) {
    throw new Error(
      'FLOOT_STT_SCRIPT (absolute path to moonshine_daemon.py) is required',
    );
  }
  if (!cwd) {
    throw new Error(
      'FLOOT_PROJECT_DIR (cwd for the uv run subprocess) is required',
    );
  }

  const moonshine = makeMoonshine({
    scriptPath,
    cwd,
    uv: env.FLOOT_STT_UV || 'uv',
    lang: env.FLOOT_STT_LANG || 'en',
  });
  // Warm up at stand-up so the first utterance doesn't pay model-load latency.
  await moonshine.warmup();
  // Tear the long-lived moonshine subprocess down when the caplet is cancelled
  // (the formula is removed or re-provisioned), so the `uv` process doesn't leak
  // across restarts. whenCancelled() rejects on cancellation.
  if (context) {
    E(context)
      .whenCancelled()
      .catch(() => moonshine.dispose());
  }

  return makeExo('AudioServer', AudioServerInterface, {
    transcribe: audioReader => {
      const { writer, reader, setOnClose } = makeTextChannel();
      // pump settles the writer on every path; guard the floating promise so a
      // throw before its try can't surface as an unhandled rejection.
      pump(moonshine, audioReader, writer, setOnClose).catch(() => {});
      return reader;
    },
    help: () =>
      'AudioServer (STT): transcribe(audioReader) -> textReader; streams replace-style transcript events (phase/partial/final/end/abort).',
  });
};
harden(make);
