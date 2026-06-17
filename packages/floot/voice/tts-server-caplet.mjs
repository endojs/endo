// The text-to-speech server object as a daemon-managed *unconfined* caplet.
//
// Symmetric to audio-server-caplet.mjs (STT), but the other direction: it takes
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

import { E } from '@endo/eventual-send';
import { Far } from '@endo/pass-style';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

// ── Minimal sentence chunker (plain JS port of sentence-chunker.ts) ──────────
const MIN_CHUNK_LENGTH = 10;
const ABBREVIATIONS = new Set([
  'St', 'Dr', 'Mr', 'Mrs', 'Ms', 'Prof', 'vs', 'etc', 'Jr', 'Sr',
]);

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
      if (!isBoundary(buffer, i)) continue;
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
      if (!trimmed) continue;
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
  return {
    push: text => {
      buffer += text;
      return flush();
    },
    finish: () => {
      const trimmed = stripMarkdown(buffer).trim();
      buffer = '';
      return trimmed ? [trimmed] : [];
    },
  };
};

// ── Minimal audio-side stream channel (Far StreamReader) ─────────────────────
const makeAudioChannel = () => {
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

  const writer = {
    bytes: (b64, sampleRate) => push({ type: 'bytes', b64, sampleRate }),
    setPhase: phase => push({ type: 'phase', phase: `${phase}` }),
    end: () => push({ type: 'end' }),
    abort: reason => push({ type: 'abort', reason: `${reason}` }),
  };

  const finalize = () => {
    finished = true;
    cursor = buffer.length;
    if (wake) {
      const w = wake;
      wake = null;
      w();
    }
  };

  const reader = Far('AudioReader', {
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
      finalize();
      return harden({ value: undefined, done: true });
    },
    throw: async error => {
      finalize();
      throw error;
    },
  });

  return { writer, reader, isClosed: () => finished };
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
        ['--model', modelPath, '--output-raw', '--length-scale', String(1 / speed)],
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
      child.stdout.on('data', c => chunks.push(c));
      child.on('close', code => {
        if (aborted) return done(new Error('aborted'));
        if (code === 0) done(null, Buffer.concat(chunks));
        else done(new Error(`piper exited with code ${code}`));
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
  let inputDone = false;
  let aborting = false;

  writer.setPhase('synthesizing');

  // Synthesize queued sentences in arrival order, emitting bytes as each lands.
  const drain = async () => {
    while (queue.length && !aborting) {
      const sentence = queue.shift();
      try {
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
    for (;;) {
      const { value, done } = await E(textReader).next();
      if (done) break;
      if (value.type === 'delta') {
        for (const s of chunker.push(value.text)) queue.push(s);
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
    inputDone = true;
    for (const s of chunker.finish()) queue.push(s);
    await drain();
    void inputDone;
    writer.end();
  } catch (err) {
    aborting = true;
    piper.abort();
    writer.abort(String(err?.message ?? err));
  }
};

// Unconfined caplet entry point. env carries the piper wiring:
//   FLOOT_TTS_BINARY  piper binary (default "piper")
//   FLOOT_TTS_MODEL   absolute path to the .onnx voice (companion .onnx.json next to it)
//   FLOOT_TTS_SPEED   speech speed multiplier (default "1.0")
export const make = async (_powers, _context, { env = {} } = {}) => {
  const binary = env.FLOOT_TTS_BINARY || 'piper';
  const modelPath = env.FLOOT_TTS_MODEL;
  const speed = Number(env.FLOOT_TTS_SPEED || '1.0') || 1.0;
  if (!modelPath) throw new Error('FLOOT_TTS_MODEL is required');

  // Parse the voice's sample rate once; every chunk uses it for the wire event.
  const config = JSON.parse(readFileSync(`${modelPath}.json`, 'utf-8'));
  const sampleRate = config?.audio?.sample_rate;
  if (typeof sampleRate !== 'number' || sampleRate <= 0) {
    throw new Error(`piper voice config ${modelPath}.json missing audio.sample_rate`);
  }

  return Far('TtsServer', {
    synthesize: textReader => {
      const { writer, reader } = makeAudioChannel();
      const piper = makePiper({ binary, modelPath, speed, sampleRate });
      pump(piper, textReader, writer);
      return reader;
    },
  });
};
