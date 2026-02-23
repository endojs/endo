#!/usr/bin/env node
/* global process */

import { parseArgs } from 'util';
import { ZipWriter } from '../src/writer.js';

const options = {
  entries: { type: 'string' },
  'total-bytes': { type: 'string' },
  iterations: { type: 'string' },
  warmup: { type: 'string' },
};

const toPositiveInt = (value, name) => {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Expected positive integer for --${name}, got: ${value}`);
  }
  return n;
};

/**
 * @param {number} seed
 */
const makeRng = seed => {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
};

/**
 * @param {number} entries
 * @param {number} totalBytes
 */
const makeInputFiles = (entries, totalBytes) => {
  const files = [];
  const rng = makeRng(0xdeadbeef);
  const base = Math.max(64, Math.floor(totalBytes / entries));
  const contents = new Map();
  let planned = 0;

  for (let i = 0; i < entries; i += 1) {
    const jitter = (rng() % (base + 1)) - Math.floor(base / 3);
    const size = Math.max(16, base + jitter);
    planned += size;
    if (!contents.has(size)) {
      const bytes = new Uint8Array(size);
      for (let j = 0; j < size; j += 1) {
        bytes[j] = (j + i) & 0xff;
      }
      contents.set(size, bytes);
    }
    const bucket = String(i % 128).padStart(3, '0');
    const name = `compartment-${bucket}/module-${String(i).padStart(5, '0')}.js`;
    files.push({
      name,
      content: contents.get(size),
    });
  }

  // Adjust the final file size so total source bytes match requested total.
  const delta = totalBytes - planned;
  if (delta !== 0 && files.length > 0) {
    const last = files[files.length - 1];
    const newSize = Math.max(16, last.content.length + delta);
    const adjusted = new Uint8Array(newSize);
    adjusted.set(last.content.subarray(0, Math.min(last.content.length, newSize)));
    for (let i = last.content.length; i < newSize; i += 1) {
      adjusted[i] = i & 0xff;
    }
    last.content = adjusted;
  }

  return files;
};

const median = values => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
};

const ms = nanos => Number(nanos) / 1e6;

const main = () => {
  const {
    values: {
      entries: entriesRaw = '4244',
      'total-bytes': totalBytesRaw = '27417643',
      iterations: iterationsRaw = '15',
      warmup: warmupRaw = '3',
    },
  } = parseArgs({ options });

  const entries = toPositiveInt(entriesRaw, 'entries');
  const totalBytes = toPositiveInt(totalBytesRaw, 'total-bytes');
  const iterations = toPositiveInt(iterationsRaw, 'iterations');
  const warmup = toPositiveInt(warmupRaw, 'warmup');

  const files = makeInputFiles(entries, totalBytes);
  const totalInputBytes = files.reduce((sum, file) => sum + file.content.length, 0);

  /** @type {Record<string, number[]>} */
  const spanSamples = Object.create(null);
  /** @type {number[]} */
  const writeMs = [];
  /** @type {number[]} */
  const snapshotMs = [];
  /** @type {number[]} */
  const totalMs = [];
  /** @type {number[]} */
  const zipSizes = [];

  const runOnce = () => {
    const spansNs = new Map();
    const profileStartSpan = name => {
      const start = process.hrtime.bigint();
      return () => {
        const end = process.hrtime.bigint();
        const elapsed = end - start;
        const prior = spansNs.get(name) || 0n;
        spansNs.set(name, prior + elapsed);
      };
    };

    const totalStart = process.hrtime.bigint();
    const writer = new ZipWriter({ date: new Date(0), profileStartSpan });

    const writeStart = process.hrtime.bigint();
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      writer.write(file.name, file.content);
    }
    const writeEnd = process.hrtime.bigint();

    const snapshotStart = process.hrtime.bigint();
    const bytes = writer.snapshot();
    const snapshotEnd = process.hrtime.bigint();
    const totalEnd = process.hrtime.bigint();

    return {
      writeMs: ms(writeEnd - writeStart),
      snapshotMs: ms(snapshotEnd - snapshotStart),
      totalMs: ms(totalEnd - totalStart),
      zipSize: bytes.length,
      spansNs,
    };
  };

  for (let i = 0; i < warmup; i += 1) {
    runOnce();
  }

  for (let i = 0; i < iterations; i += 1) {
    const sample = runOnce();
    writeMs.push(sample.writeMs);
    snapshotMs.push(sample.snapshotMs);
    totalMs.push(sample.totalMs);
    zipSizes.push(sample.zipSize);
    for (const [name, elapsed] of sample.spansNs.entries()) {
      if (!spanSamples[name]) {
        spanSamples[name] = [];
      }
      spanSamples[name].push(ms(elapsed));
    }
  }

  const spanRows = Object.entries(spanSamples)
    .map(([name, values]) => ({
      name,
      avgMs: values.reduce((sum, value) => sum + value, 0) / values.length,
      p50Ms: median(values),
    }))
    .sort((a, b) => b.avgMs - a.avgMs);

  process.stdout.write(
    [
      `zip writer benchmark`,
      `entries=${entries}`,
      `inputBytes=${totalInputBytes}`,
      `iterations=${iterations}`,
      `warmup=${warmup}`,
      `zipBytes(avg)=${Math.round(
        zipSizes.reduce((sum, value) => sum + value, 0) / zipSizes.length,
      )}`,
      `totalMs avg=${(totalMs.reduce((a, b) => a + b, 0) / totalMs.length).toFixed(3)} p50=${median(totalMs).toFixed(3)}`,
      `writeMs avg=${(writeMs.reduce((a, b) => a + b, 0) / writeMs.length).toFixed(3)} p50=${median(writeMs).toFixed(3)}`,
      `snapshotMs avg=${(snapshotMs.reduce((a, b) => a + b, 0) / snapshotMs.length).toFixed(3)} p50=${median(snapshotMs).toFixed(3)}`,
      '',
      'snapshot span breakdown (avg / p50 ms):',
      ...spanRows.map(
        row =>
          `  ${row.name}: ${row.avgMs.toFixed(3)} / ${row.p50Ms.toFixed(3)}`,
      ),
      '',
    ].join('\n'),
  );
};

main();
