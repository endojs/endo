// @ts-check
// The text-to-speech server object as a daemon-managed *unconfined* caplet.
//
// Symmetric to audio-server-caplet.js (STT), but the other direction: it takes
// a stream of reply text and returns a stream of synthesized audio bytes:
//
//   ttsServer.synthesize(textReader) -> audioReader
//
// textReader yields the reply wire shape this caplet cares about (APPEND
// deltas, like the floot converse reply — NOT the STT replace wire):
//   { type: 'delta', text } | { type: 'end' } | { type: 'abort', reason }
// The caller feeds reply deltas as they stream from the LLM; for replay of a
// finished message it feeds the whole text as a single delta then end. We never
// consume a 'final' event so a caller can't double-speak the same words.
//
// audioReader yields:
//   { type: 'phase', phase } |
//   { type: 'bytes', b64, sampleRate } |   // raw s16le mono PCM, base64
//   { type: 'end' } | { type: 'abort', reason }
// One 'bytes' event per speakable sentence chunk, emitted as soon as piper
// finishes that chunk — so the browser can start playing sentence 1 while later
// text is still arriving. Raw PCM (not WAV/mp3) so the browser builds an
// AudioBuffer directly with no decode and we avoid an ffmpeg hop.
//
// Self-contained on purpose (the daemon worker is plain Node, no tsx): mirrors
// src/tts/piper-tts.ts + sentence-chunker.ts reduced to what synthesize needs.
// A separate object from the STT caplet so the two are independently swappable.
// See [[project-voice-space-m2]] and §11 of docs/endo-daemon-integration.md.

/* global Buffer */
import { E } from '@endo/eventual-send';
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { makeBufferedReader } from '@endo/exo-stream/buffered-channel.js';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';

// `synthesize` is synchronous (returns the audio reader immediately, then
// streams), so it is guarded with `M.call`. Guards are permissive — the daemon
// path is not runtime-tested here.
const TtsServerInterface = M.interface('TtsServer', {
  synthesize: M.call(M.any()).returns(M.remotable()),
  help: M.call().returns(M.string()),
});

// ── Minimal sentence chunker (plain JS port of sentence-chunker.ts) ──────────
const MIN_CHUNK_LENGTH = 10;
const ABBREVIATIONS = harden(
  new Set(['St', 'Dr', 'Mr', 'Mrs', 'Ms', 'Prof', 'vs', 'etc', 'Jr', 'Sr']),
);

// Strip the markdown that would otherwise be read aloud as punctuation noise.
const stripMarkdown = text =>
  `${text}`
    .replace(/```[\s\S]*?```/g, ' ') // fenced code
    .replace(/`([^`]+)`/g, '$1') // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links -> text
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1') // bold/italic
    .replace(/^#{1,6}\s+/gm, '') // headings
    .replace(/^\s*>\s?/gm, '') // blockquotes
    .replace(/^\s*[-*+]\s+/gm, ''); // bullet markers

const isAbbrev = (text, i) => {
  const m = text.slice(0, i).match(/([A-Za-z]+)$/);
  return m !== null && ABBREVIATIONS.has(m[1]);
};
const isListMarker = (text, i) => {
  const before = text.slice(0, i);
  const linePrefix = before.slice(before.lastIndexOf('\n') + 1);
  return /^\d+$/.test(linePrefix);
};
const isBoundary = (text, i) => {
  const c = text[i];
  if (c === '\n') return true;
  if (c !== '.' && c !== '!' && c !== '?') return false;
  const next = text[i + 1];
  if (next === undefined || !/\s/.test(next)) return false;
  if (c === '.' && (isListMarker(text, i) || isAbbrev(text, i))) return false;
  return true;
};

const makeChunker = () => {
  let buffer = '';
  const flush = () => {
    const rawParts = [];
    let start = 0;
    for (let i = 0; i < buffer.length; i += 1) {
      if (!isBoundary(buffer, i)) continue; // eslint-disable-line no-continue
      let end = i + 1;
      while (end < buffer.length && /\s/.test(buffer[end])) end += 1;
      rawParts.push(buffer.slice(start, end));
      start = end;
      i = end - 1;
    }
    const tail = buffer.slice(start);
    const chunks = [];
    let pending = '';
    for (const part of rawParts) {
      const trimmed = stripMarkdown(part).trim();
      if (!trimmed) continue; // eslint-disable-line no-continue
      const combined = pending ? `${pending} ${trimmed}` : trimmed;
      if (combined.length >= MIN_CHUNK_LENGTH) {
        chunks.push(combined);
        pending = '';
      } else {
        pending = combined;
      }
    }
    buffer = pending ? [pending, tail].filter(Boolean).join(' ') : tail;
    return chunks;
  };
  return harden({
    push: text => {
      buffer += text;
      return flush();
    },
    finish: () => {
      const trimmed = stripMarkdown(buffer).trim();
      buffer = '';
      return trimmed ? [trimmed] : [];
    },
  });
};

// ── Minimal audio-side stream channel (Far StreamReader) ─────────────────────
// onClose fires when the consumer stops pulling (return/throw) so the producer
// (piper) can be aborted — otherwise an interrupted replay keeps synthesizing
// every remaining sentence with no one to receive the audio.
const makeAudioChannel = onClose => {
  const { push, reader, isClosed } = makeBufferedReader({ onClose });
  const writer = {
    bytes: (b64, sampleRate) => push({ type: 'bytes', b64, sampleRate }),
    setPhase: phase => push({ type: 'phase', phase: `${phase}` }),
    end: () => push({ type: 'end' }),
    abort: reason => push({ type: 'abort', reason: `${reason}` }),
  };
  return harden({ writer, reader, isClosed });
};

// ── Minimal piper driver (plain JS port of PiperTTSStream.synthesize) ────────
const makePiper = ({ binary, modelPath, speed, sampleRate }) => {
  const active = new Set();
  let aborted = false;

  // Synthesize one sentence to raw s16le mono PCM bytes.
  const synthOne = text =>
    new Promise((resolve, reject) => {
      if (aborted) {
        reject(new Error('aborted'));
        return;
      }
      // length-scale stretches phoneme duration, so speed is its inverse.
      const child = spawn(
        binary,
        [
          '--model',
          modelPath,
          '--output-raw',
          '--length-scale',
          String(1 / speed),
        ],
        { stdio: ['pipe', 'pipe', 'ignore'] },
      );
      active.add(child);
      const chunks = [];
      let settled = false;
      const done = (err, buf) => {
        if (settled) return;
        settled = true;
        active.delete(child);
        if (err) reject(err);
        else resolve(buf);
      };
      child.on('error', err => done(err));
      // stdin can emit EPIPE if piper exits/closes before consuming input (bad
      // model, or killed mid-write by abort()); without a handler Node escalates
      // it to an uncaught exception that tears down the whole worker.
      child.stdin.on('error', err => done(err));
      child.stdout.on('data', c => chunks.push(c));
      child.on('close', code => {
        if (aborted) {
          done(new Error('aborted'));
        } else if (code === 0) {
          done(null, Buffer.concat(chunks));
        } else {
          done(new Error(`piper exited with code ${code}`));
        }
      });
      child.stdin.write(text);
      child.stdin.end();
    });

  return {
    sampleRate,
    synthOne,
    abort: () => {
      aborted = true;
      for (const child of active) {
        if (!child.killed) child.kill('SIGTERM');
      }
      active.clear();
    },
  };
};

// Read reply text deltas, chunk into sentences, synthesize each in order, and
// stream the audio bytes. Sentences are synthesized sequentially so audio plays
// back in order and we don't spawn an unbounded number of piper processes.
const pump = async (piper, textReader, writer) => {
  const chunker = makeChunker();
  const queue = [];
  let aborting = false;

  writer.setPhase('synthesizing');

  // Synthesize queued sentences in arrival order, emitting bytes as each lands.
  const drain = async () => {
    while (queue.length && !aborting) {
      const sentence = queue.shift();
      try {
        // eslint-disable-next-line no-await-in-loop
        const buf = await piper.synthOne(sentence);
        if (aborting) return;
        writer.bytes(buf.toString('base64'), piper.sampleRate);
      } catch (err) {
        if (aborting) return;
        throw err;
      }
    }
  };

  try {
    for await (const value of iterateReader(textReader, { buffer: 4 })) {
      if (value.type === 'delta') {
        for (const s of chunker.push(value.text)) queue.push(s);
        // eslint-disable-next-line no-await-in-loop
        await drain();
      } else if (value.type === 'end') {
        break;
      } else if (value.type === 'abort') {
        aborting = true;
        piper.abort();
        writer.abort(value.reason);
        return;
      }
    }
    for (const s of chunker.finish()) queue.push(s);
    await drain();
    writer.end();
  } catch (err) {
    aborting = true;
    piper.abort();
    writer.abort(err instanceof Error ? err.message : String(err));
  }
};

// Unconfined caplet entry point. env carries the piper wiring:
//   FLOOT_TTS_BINARY  piper binary (default "piper")
//   FLOOT_TTS_MODEL   absolute path to the .onnx voice (companion .onnx.json next to it)
//   FLOOT_TTS_SPEED   speech speed multiplier (default "1.0")
/**
 * @param {object} _powers
 * @param {any} context daemon caplet context (whenCancelled for teardown)
 * @param {{ env?: Record<string, string | undefined> }} [opts]
 */
export const make = async (_powers, context, { env = {} } = {}) => {
  const binary = env.FLOOT_TTS_BINARY || 'piper';
  const modelPath = env.FLOOT_TTS_MODEL;
  if (!modelPath) throw new Error('FLOOT_TTS_MODEL is required');
  // Speed drives piper's --length-scale (1/speed), so a non-positive or
  // non-finite value yields a nonsensical scale and piper fails obscurely.
  // Reject it up front with a capability-level error instead.
  let speed = 1.0;
  if (env.FLOOT_TTS_SPEED !== undefined && env.FLOOT_TTS_SPEED !== '') {
    const parsed = Number(env.FLOOT_TTS_SPEED);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(
        `FLOOT_TTS_SPEED must be a positive number, got "${env.FLOOT_TTS_SPEED}".`,
      );
    }
    speed = parsed;
  }

  // Parse the voice's sample rate once; every chunk uses it for the wire event.
  const config = JSON.parse(readFileSync(`${modelPath}.json`, 'utf-8'));
  const sampleRate = config?.audio?.sample_rate;
  if (typeof sampleRate !== 'number' || sampleRate <= 0) {
    throw new Error(
      `piper voice config ${modelPath}.json missing audio.sample_rate`,
    );
  }

  // Abort any in-flight piper subprocesses when the caplet is cancelled (the
  // formula is removed or re-provisioned), so they don't leak.
  const pipers = new Set();
  if (context) {
    E(context)
      .whenCancelled()
      .catch(() => {
        for (const piper of pipers) piper.abort();
        pipers.clear();
      });
  }

  return makeExo('TtsServer', TtsServerInterface, {
    synthesize: textReader => {
      const piper = makePiper({ binary, modelPath, speed, sampleRate });
      pipers.add(piper);
      // If the consumer stops pulling (replay interrupted), abort piper so it
      // doesn't keep synthesizing sentences no one will receive.
      const { writer, reader } = makeAudioChannel(() => piper.abort());
      // pump settles the writer on every path; guard the floating promise and
      // drop the piper from the live set once the turn ends.
      pump(piper, textReader, writer).finally(() => pipers.delete(piper));
      return reader;
    },
    help: () =>
      'TtsServer: synthesize(textReader) -> audioReader; streams raw s16le PCM bytes (one event per sentence) as piper renders the reply.',
  });
};
harden(make);
