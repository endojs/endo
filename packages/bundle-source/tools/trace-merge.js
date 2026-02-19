#!/usr/bin/env node
// @ts-check
/* global process */

import fs from 'fs/promises';
import path from 'path';
import { parseArgs } from 'util';

const options = /** @type {const} */ ({
  'out-trace': { type: 'string' },
  'out-summary': { type: 'string' },
  'out-markdown': { type: 'string' },
  top: { type: 'string' },
  stacked: { type: 'boolean' },
});

const usage = `\
Usage:
  node tools/trace-merge.js [--out-trace merged.trace.json] [--out-summary summary.json] [--out-markdown summary.md] [--top 30] [--stacked] <trace-file-or-dir>...

Examples:
  node tools/trace-merge.js /tmp/bs-profiles
  node tools/trace-merge.js --out-markdown /tmp/summary.md /tmp/bs-profiles /tmp/other.trace.json
`;

/**
 * @param {string} value
 * @returns {number}
 */
const toInt = value => {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Expected positive integer, got: ${value}`);
  }
  return n;
};

/**
 * @param {string} filePath
 * @returns {Promise<boolean>}
 */
const exists = async filePath => {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
};

/**
 * @param {string} root
 * @returns {Promise<string[]>}
 */
const findTraceFiles = async root => {
  const stat = await fs.stat(root);
  if (stat.isFile()) {
    return root.endsWith('.trace.json') ? [root] : [];
  }
  if (!stat.isDirectory()) {
    return [];
  }
  /** @type {string[]} */
  const found = [];
  const queue = [root];
  while (queue.length > 0) {
    const dir = queue.shift();
    if (!dir) {
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const filePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        queue.push(filePath);
      } else if (entry.isFile() && entry.name.endsWith('.trace.json')) {
        found.push(filePath);
      }
    }
  }
  return found;
};

/**
 * @param {number[]} sorted
 * @param {number} p
 * @returns {number}
 */
const percentile = (sorted, p) => {
  if (sorted.length === 0) {
    return 0;
  }
  if (sorted.length === 1) {
    return sorted[0];
  }
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) {
    return sorted[lo];
  }
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
};

/**
 * @param {number} micros
 * @returns {string}
 */
const microsToMsText = micros => (micros / 1000).toFixed(3);

/**
 * @param {Array<Record<string, unknown>>} events
 * @param {number} top
 */
const summarize = (events, top) => {
  /** @type {Map<string, number[]>} */
  const durationsByName = new Map();
  for (const event of events) {
    if (event.ph !== 'X' || typeof event.name !== 'string') {
      continue;
    }
    const dur = typeof event.dur === 'number' ? event.dur : undefined;
    if (dur === undefined) {
      continue;
    }
    const bucket = durationsByName.get(event.name);
    if (bucket) {
      bucket.push(dur);
    } else {
      durationsByName.set(event.name, [dur]);
    }
  }

  const rows = [...durationsByName.entries()].map(([name, durations]) => {
    durations.sort((a, b) => a - b);
    const total = durations.reduce((sum, value) => sum + value, 0);
    return {
      name,
      count: durations.length,
      totalUs: total,
      avgUs: total / durations.length,
      minUs: durations[0],
      maxUs: durations[durations.length - 1],
      p50Us: percentile(durations, 50),
      p95Us: percentile(durations, 95),
    };
  });
  rows.sort((a, b) => b.totalUs - a.totalUs);
  return rows.slice(0, top);
};

/**
 * @param {ReturnType<typeof summarize>} rows
 * @returns {string}
 */
const summarizeMarkdown = rows => {
  const header = [
    '| Span | Count | Total ms | Avg ms | P50 ms | P95 ms | Max ms |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  const body = rows.map(row =>
    [
      `| ${row.name}`,
      `${row.count}`,
      `${microsToMsText(row.totalUs)}`,
      `${microsToMsText(row.avgUs)}`,
      `${microsToMsText(row.p50Us)}`,
      `${microsToMsText(row.p95Us)}`,
      `${microsToMsText(row.maxUs)} |`,
    ].join(' | '),
  );
  return `${header.join('\n')}\n${body.join('\n')}\n`;
};

const main = async () => {
  const {
    values: {
      'out-trace': outTrace = 'merged.trace.json',
      'out-summary': outSummary = 'summary.json',
      'out-markdown': outMarkdown = 'summary.md',
      top: topRaw = '30',
      stacked = true,
    },
    positionals,
  } = parseArgs({ options, allowPositionals: true });

  if (positionals.length === 0) {
    throw new Error(usage);
  }
  const top = toInt(topRaw);

  /** @type {string[]} */
  const traceFiles = [];
  for (const input of positionals) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await exists(input))) {
      throw new Error(`Input does not exist: ${input}`);
    }
    // eslint-disable-next-line no-await-in-loop
    const files = await findTraceFiles(input);
    traceFiles.push(...files);
  }

  if (traceFiles.length === 0) {
    throw new Error(`No *.trace.json files found in inputs.\n\n${usage}`);
  }

  /** @type {Array<Record<string, unknown>>} */
  const mergedEvents = [];
  let offsetUs = 0;
  for (const filePath of traceFiles.sort()) {
    // eslint-disable-next-line no-await-in-loop
    const text = await fs.readFile(filePath, 'utf-8');
    /** @type {{traceEvents?: Array<Record<string, unknown>>}} */
    const trace = JSON.parse(text);
    const events = trace.traceEvents || [];
    let maxEndUs = 0;
    for (const event of events) {
      const copy = { ...event, args: { ...(event.args || {}), source: filePath } };
      if (stacked) {
        if (typeof copy.ts === 'number') {
          copy.ts += offsetUs;
        }
      }
      const ts = typeof copy.ts === 'number' ? copy.ts : 0;
      const dur = typeof copy.dur === 'number' ? copy.dur : 0;
      maxEndUs = Math.max(maxEndUs, ts + dur);
      mergedEvents.push(copy);
    }
    if (stacked) {
      offsetUs = maxEndUs + 1000;
    }
  }

  const summaryTop = summarize(mergedEvents, top);
  const summary = {
    generatedAt: new Date().toISOString(),
    traceFileCount: traceFiles.length,
    eventCount: mergedEvents.length,
    topSpansByTotalDuration: summaryTop,
    traceFiles,
  };

  await fs.writeFile(
    outTrace,
    JSON.stringify({ traceEvents: mergedEvents, displayTimeUnit: 'ms' }, null, 2),
  );
  await fs.writeFile(outSummary, JSON.stringify(summary, null, 2));
  await fs.writeFile(outMarkdown, summarizeMarkdown(summaryTop));

  process.stdout.write(`Merged ${traceFiles.length} trace files\n`);
  process.stdout.write(`Wrote merged trace: ${outTrace}\n`);
  process.stdout.write(`Wrote summary JSON: ${outSummary}\n`);
  process.stdout.write(`Wrote summary Markdown: ${outMarkdown}\n`);
};

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exit(1);
});
