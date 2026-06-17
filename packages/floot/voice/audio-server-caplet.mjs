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
import { Far } from '@endo/pass-style';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

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

      proc.stdout.setEncoding('utf-8');
      proc.stdout.on('data', chunk => {
        stdoutBuffer += chunk;
        let nl;
        while ((nl = stdoutBuffer.indexOf('\n')) !== -1) {
          const line = stdoutBuffer.slice(0, nl).trim();
          stdoutBuffer = stdoutBuffer.slice(nl + 1);
          if (!line) continue;
          let msg;
          try {
            msg = JSON.parse(line);
          } catch {
            continue;
          }
          if (msg.event === 'ready') {
            ready = true;
            resolve();
            continue;
          }
          if (msg.stream && msg.partial !== undefined) {
            const h = partialHandlers.get(msg.stream);
            if (h) h(msg.partial);
            continue;
          }
          if (msg.stream) {
            const req = pendingStreams.get(msg.stream);
            if (!req) continue;
            pendingStreams.delete(msg.stream);
            if (msg.error !== undefined) {
              req.reject(new Error(`moonshine: ${msg.error}`));
            } else {
              req.resolve((msg.text ?? '').trim());
            }
          }
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
const makeTextChannel = () => {
  const buffer = [];
  let finished = false;
  let cursor = 0;
  let wake = null;

  const push = event => {
    if (finished) return;
    buffer.push(harden(event));
    if (event.type === 'end' || event.type === 'abort') finished = true;
    if (wake) {
      const w = wake;
      wake = null;
      w();
    }
  };

  // Text events carry the *full current transcript* (replace semantics), not
  // deltas: moonshine partials are cumulative and freely revise earlier words
  // (e.g. inserting punctuation), so an append-only wire can't represent them.
  const writer = {
    partial: text => push({ type: 'partial', text: `${text}` }),
    final: text => push({ type: 'final', text: `${text}` }),
    setPhase: phase => push({ type: 'phase', phase: `${phase}` }),
    end: () => push({ type: 'end' }),
    abort: reason => push({ type: 'abort', reason: `${reason}` }),
  };

  const reader = Far('StreamReader', {
    next: async () => {
      for (;;) {
        if (cursor < buffer.length) {
          return harden({ value: buffer[cursor++], done: false });
        }
        if (finished) return harden({ value: undefined, done: true });
        await new Promise(resolve => {
          wake = resolve;
        });
      }
    },
    return: async () => {
      finished = true;
      cursor = buffer.length;
      if (wake) {
        const w = wake;
        wake = null;
        w();
      }
      return harden({ value: undefined, done: true });
    },
    throw: async error => {
      finished = true;
      cursor = buffer.length;
      if (wake) {
        const w = wake;
        wake = null;
        w();
      }
      throw error;
    },
  });

  return { writer, reader };
};

// Pump audio frames into moonshine and stream transcript events. Each partial
// is the full evolving transcript; forward it as-is so the UI can re-render
// (and absorb moonshine's mid-stream revisions) instead of accreting deltas.
const pump = async (moonshine, audioReader, writer) => {
  const sink = moonshine.startUtterance(partial => writer.partial(partial));
  writer.setPhase('listening');
  try {
    for (;;) {
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
    sink.abort();
    writer.abort(String(err?.message ?? err));
  }
};

// Unconfined caplet entry point. env carries the moonshine wiring:
//   FLOOT_STT_SCRIPT  absolute path to moonshine_daemon.py (PEP-723 self-contained)
//   FLOOT_PROJECT_DIR cwd for the `uv run` subprocess
//   FLOOT_STT_UV      uv binary (default "uv")
//   FLOOT_STT_LANG    language (default "en")
export const make = async (_powers, _context, { env = {} } = {}) => {
  const moonshine = makeMoonshine({
    scriptPath: env.FLOOT_STT_SCRIPT,
    cwd: env.FLOOT_PROJECT_DIR,
    uv: env.FLOOT_STT_UV || 'uv',
    lang: env.FLOOT_STT_LANG || 'en',
  });
  // Warm up at stand-up so the first utterance doesn't pay model-load latency.
  await moonshine.warmup();

  return Far('AudioServer', {
    transcribe: audioReader => {
      const { writer, reader } = makeTextChannel();
      pump(moonshine, audioReader, writer);
      return reader;
    },
  });
};
