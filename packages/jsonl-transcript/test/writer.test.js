// @ts-check
import test from 'ava';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { makeSessionWriter } from '../src/writer.js';
import { loadFromJsonl, readSessionFile } from '../src/reader.js';

/** @returns {Promise<string>} */
const tmpPath = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jsonl-transcript-'));
  // Deliberately nest under a not-yet-existing subdirectory to exercise the
  // recursive mkdir the writer performs.
  return join(dir, 'sessions', 'guest', '001_s.jsonl');
};

test('the writer creates the file lazily, mode 0600, appending a header then messages', async t => {
  const path = await tmpPath();
  const writer = makeSessionWriter({ path });
  await writer.writeHeader({ sessionId: 's', createdAt: 1 });
  await writer.appendMessage(
    { role: 'user', content: 'hello' },
    { id: 'a:0', parentId: null, 'endo:messageId': 'a' },
  );
  await writer.close();

  const info = await stat(path);
  t.is(info.mode % 0o1000, 0o600, 'file is private (0600)');

  const graph = await readSessionFile({ path });
  t.is(graph.header?.sessionId, 's');
  t.is(graph.entries.length, 2);
  const [, message] = graph.entries;
  t.is(message.type === 'message' && message.message.content, 'hello');
});

test('reopening an existing session appends without doubling the header', async t => {
  const path = await tmpPath();

  const first = makeSessionWriter({ path });
  await first.writeHeader({ sessionId: 's', createdAt: 1 });
  await first.appendMessage(
    { role: 'user', content: 'one' },
    { id: 'a:0', parentId: null },
  );
  await first.close();

  // Simulate a daemon restart: a fresh writer over the same path.
  const second = makeSessionWriter({ path });
  await second.writeHeader({ sessionId: 's', createdAt: 1 });
  await second.appendMessage(
    { role: 'user', content: 'two' },
    { id: 'b:0', parentId: 'a:0' },
  );
  await second.close();

  const graph = await readSessionFile({ path });
  const headers = graph.entries.filter(e => e.type === 'header');
  t.is(headers.length, 1, 'exactly one header survives the reopen');
  t.is(graph.entries.length, 3, 'header + two messages');
});

test('a torn final line from a crash mid-append is recovered on reopen', async t => {
  const path = await tmpPath();

  const writer = makeSessionWriter({ path });
  await writer.writeHeader({ sessionId: 's', createdAt: 1 });
  await writer.close();

  // Corrupt the file with a half-written line (no trailing newline).
  const existing = await readFile(path, 'utf8');
  await writeFile(path, `${existing}{"type":"message","id":"tor`);

  // Before recovery the raw text has a trailing partial.
  const beforeText = await readFile(path, 'utf8');
  t.is(
    loadFromJsonl(beforeText).entries.length,
    1,
    'torn line is not a valid entry',
  );

  // Reopening truncates the torn line, then appends cleanly.
  const reopened = makeSessionWriter({ path });
  await reopened.appendMessage(
    { role: 'user', content: 'recovered' },
    { id: 'a:0', parentId: null },
  );
  await reopened.close();

  const graph = await readSessionFile({ path });
  t.is(
    graph.entries.length,
    2,
    'header + the clean append; the torn line is gone',
  );
  const last = graph.entries[1];
  t.is(last.type === 'message' && last.message.content, 'recovered');
});

test('readSessionFile of a nonexistent path yields an empty graph', async t => {
  const path = await tmpPath(); // never written
  const graph = await readSessionFile({ path });
  t.is(graph.header, null);
  t.is(graph.entries.length, 0);
});

test('concurrent first-writes share a single open (no leaked handle)', async t => {
  // Count fs.open calls through an injected filesystem seam. Racing the first
  // header and first append on a fresh file must open the file exactly once;
  // without the in-flight-open latch each caller would open its own handle.
  let opens = 0;
  let closes = 0;
  /** @type {string[]} */
  const lines = [];
  /** @type {import('../types.js').WriterFs} */
  const countingFs = {
    async mkdir() {
      return undefined;
    },
    async readFile() {
      const err = /** @type {NodeJS.ErrnoException} */ (new Error('ENOENT'));
      err.code = 'ENOENT';
      throw err;
    },
    async truncate() {
      return undefined;
    },
    async open() {
      opens += 1;
      return {
        async write(data) {
          lines.push(data);
          return { bytesWritten: data.length };
        },
        async close() {
          closes += 1;
        },
      };
    },
  };
  const writer = makeSessionWriter({
    path: '/state/sessions/g/1_s.jsonl',
    fs: countingFs,
  });
  await Promise.all([
    writer.writeHeader({ sessionId: 's', createdAt: 1 }),
    writer.append({
      type: 'message',
      id: 'a:0',
      parentId: null,
      message: { role: 'user', content: 'hi' },
    }),
  ]);
  await writer.close();
  t.is(opens, 1, 'the file is opened exactly once despite the race');
  t.is(closes, 1, 'the single handle is closed once');
  t.is(lines.length, 2, 'both the header and the message were written');
});
