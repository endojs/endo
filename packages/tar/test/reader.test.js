// Establish a perimeter:
// eslint-disable-next-line import/order
import '@endo/init/debug.js';

import assert from 'node:assert';
import test from 'ava';
import {
  isZeroTarBlock,
  tarString,
  tarOctal,
  parsePaxRecords,
  tarPathSegments,
  makeTarReader,
  readTarEntries,
} from '../index.js';

const TAR_BLOCK_SIZE = 512;
const utf8 = new TextEncoder();
const text = bytes => new TextDecoder().decode(bytes);

/**
 * Build a minimal ustar entry (header + content + block padding).
 *
 * @param {string} name
 * @param {Uint8Array} content
 * @param {string} [typeFlag] single-character ustar type flag (default '0',
 *   a regular file). 'x'/'g' produce pax extended-header blocks; '5' a
 *   directory; '2' a symlink.
 * @param {object} [options]
 * @param {string} [options.linkName] symlink target (header bytes 157..257)
 * @param {string} [options.prefix] ustar path prefix (header bytes 345..500)
 */
const tarEntry = (name, content, typeFlag = '0', options = {}) => {
  const { linkName = '', prefix = '' } = options;
  const header = new Uint8Array(TAR_BLOCK_SIZE);
  header.set(utf8.encode(name).subarray(0, 100), 0);
  header.set(utf8.encode('0000644\0'), 100);
  header.set(utf8.encode('0000000\0'), 108);
  header.set(utf8.encode('0000000\0'), 116);
  header.set(
    utf8.encode(`${content.byteLength.toString(8).padStart(11, '0')}\0`),
    124,
  );
  header.set(utf8.encode('00000000000\0'), 136);
  header.set(utf8.encode(typeFlag), 156);
  if (linkName !== '') {
    header.set(utf8.encode(linkName).subarray(0, 100), 157);
  }
  header.set(utf8.encode('ustar\0'), 257);
  if (prefix !== '') {
    header.set(utf8.encode(prefix).subarray(0, 155), 345);
  }
  const pad =
    (TAR_BLOCK_SIZE - (content.byteLength % TAR_BLOCK_SIZE)) % TAR_BLOCK_SIZE;
  const out = new Uint8Array(TAR_BLOCK_SIZE + content.byteLength + pad);
  out.set(header, 0);
  out.set(content, TAR_BLOCK_SIZE);
  return out;
};

/**
 * Build a pax extended-header block (`typeFlag` 'x' for next-entry scope,
 * 'g' for global scope) from a record map, mirroring `git archive
 * --format=tar`. Each pax record is `"<length> <key>=<value>\n"` where
 * `<length>` is the self-referential decimal byte length of the whole
 * record.
 *
 * @param {Record<string, string>} records
 * @param {string} [typeFlag]
 */
const paxHeader = (records, typeFlag = 'x') => {
  let body = '';
  for (const [key, value] of Object.entries(records)) {
    const tail = ` ${key}=${value}\n`;
    let length = tail.length + 1;
    while (`${length}`.length + tail.length !== length) {
      length = `${length}`.length + tail.length;
    }
    body += `${length}${tail}`;
  }
  return tarEntry('@PaxHeader', utf8.encode(body), typeFlag);
};

const concatBytes = parts => {
  const total = parts.reduce((n, p) => n + p.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.byteLength;
  }
  return out;
};

async function* single(bytes) {
  yield bytes;
}

// Collect entries plus their fully-drained content into plain records.
const collect = async source => {
  const out = [];
  for await (const entry of readTarEntries(source)) {
    const chunks = [];
    for await (const chunk of entry.content) {
      chunks.push(chunk);
    }
    out.push({
      type: entry.type,
      path: entry.path,
      size: entry.size,
      linkname: entry.linkname,
      content: text(concatBytes(chunks)),
    });
  }
  return out;
};

test('isZeroTarBlock distinguishes the archive terminator', t => {
  t.true(isZeroTarBlock(new Uint8Array(TAR_BLOCK_SIZE)));
  const nonZero = new Uint8Array(TAR_BLOCK_SIZE);
  nonZero[7] = 1;
  t.false(isZeroTarBlock(nonZero));
});

test('tarString stops at the first NUL', t => {
  const field = new Uint8Array([0x61, 0x62, 0x63, 0, 0x64]);
  t.is(tarString(field), 'abc');
  t.is(tarString(utf8.encode('nofield')), 'nofield');
});

test('tarOctal parses octal fields and rejects non-octal', t => {
  t.is(tarOctal(utf8.encode('0000644\0')), 0o644);
  t.is(tarOctal(utf8.encode('   \0')), 0);
  t.throws(() => tarOctal(utf8.encode('0089\0')), {
    message: /Invalid tar octal field/,
  });
});

test('parsePaxRecords honors path and size, ignores other keys', t => {
  const record = (key, value) => {
    const tail = ` ${key}=${value}\n`;
    let length = tail.length + 1;
    while (`${length}`.length + tail.length !== length) {
      length = `${length}`.length + tail.length;
    }
    return `${length}${tail}`;
  };
  const body =
    record('path', 'a/b/c') + record('size', '7') + record('mtime', '1');
  t.deepEqual(parsePaxRecords(utf8.encode(body)), { path: 'a/b/c', size: 7 });
});

test('parsePaxRecords rejects a malformed record', t => {
  t.throws(() => parsePaxRecords(utf8.encode('5 path\n')), {
    message: /Malformed pax extended header record/,
  });
});

test('tarPathSegments validates and splits, rejecting traversal', t => {
  t.deepEqual(tarPathSegments('a/b/c'), ['a', 'b', 'c']);
  t.deepEqual(tarPathSegments('a//b/'), ['a', 'b']);
  t.throws(() => tarPathSegments('/abs'), {
    message: /Invalid tar entry path/,
  });
  t.throws(() => tarPathSegments(''), { message: /Invalid tar entry path/ });
  t.throws(() => tarPathSegments('a/../b'), {
    message: /Invalid tar entry path segment/,
  });
});

test('makeTarReader streams content and stays block-aligned', async t => {
  const content = utf8.encode('hello');
  const archive = concatBytes([
    tarEntry('greeting.txt', content),
    new Uint8Array(TAR_BLOCK_SIZE * 2),
  ]);
  const reader = makeTarReader(single(archive));
  const header = await reader.readBlock();
  // The fixture is a well-formed entry, so readBlock yields a block here;
  // assert narrows away the clean-end-of-archive `undefined`.
  assert(header);
  t.is(tarString(header.slice(0, 100)), 'greeting.txt');
  const chunks = [];
  for await (const chunk of reader.streamContent(5, 'greeting.txt')) {
    chunks.push(chunk);
  }
  t.is(text(concatBytes(chunks)), 'hello');
  // After consuming content + padding, the next block is the zero
  // terminator, which readBlock surfaces (the caller decides it ends).
  const terminator = await reader.readBlock();
  assert(terminator);
  t.true(isZeroTarBlock(terminator));
});

test('makeTarReader rejects a truncated header', async t => {
  await t.throwsAsync(
    () => makeTarReader(single(new Uint8Array(100))).readBlock(),
    { message: /Truncated tar header/ },
  );
});

test('readTarEntries yields files, directories, and symlinks', async t => {
  const archive = concatBytes([
    tarEntry('dir/', new Uint8Array(0), '5'),
    tarEntry('dir/file.txt', utf8.encode('content')),
    tarEntry('dir/link', new Uint8Array(0), '2', { linkName: 'file.txt' }),
    new Uint8Array(TAR_BLOCK_SIZE * 2),
  ]);
  const entries = await collect(single(archive));
  t.deepEqual(
    entries.map(e => ({ type: e.type, path: e.path })),
    [
      { type: 'directory', path: 'dir/' },
      { type: 'file', path: 'dir/file.txt' },
      { type: 'symlink', path: 'dir/link' },
    ],
  );
  t.is(entries[1].content, 'content');
  t.is(entries[2].linkname, 'file.txt');
});

test('readTarEntries terminates at the first zero block', async t => {
  const archive = concatBytes([
    tarEntry('a.txt', utf8.encode('a')),
    new Uint8Array(TAR_BLOCK_SIZE * 2),
    // A trailing entry after the terminator must never be read.
    tarEntry('ghost.txt', utf8.encode('boo')),
  ]);
  const entries = await collect(single(archive));
  t.deepEqual(
    entries.map(e => e.path),
    ['a.txt'],
  );
});

test('readTarEntries honors a pax size override for the content span', async t => {
  // The ustar size field claims the full 4-byte content block, but a
  // preceding pax `size` record narrows the real payload to 3 bytes.
  const padded = new Uint8Array(4);
  padded.set(utf8.encode('abc'), 0); // 'abc' + one NUL padding byte
  const archive = concatBytes([
    paxHeader({ size: '3' }),
    tarEntry('sized.txt', padded),
    new Uint8Array(TAR_BLOCK_SIZE * 2),
  ]);
  const entries = await collect(single(archive));
  // Fail-closed: without honoring pax `size` the content would be 'abc\0'.
  t.is(entries[0].size, 3);
  t.is(entries[0].content, 'abc');
});

test('readTarEntries honors a next-entry pax path override', async t => {
  const longName = `${'next-pax-segment-'.repeat(7)}tail.txt`;
  t.true(longName.length > 100);
  const archive = concatBytes([
    paxHeader({ path: longName }, 'x'),
    tarEntry(longName.slice(0, 100), utf8.encode('payload'), '0'),
    new Uint8Array(TAR_BLOCK_SIZE * 2),
  ]);
  const entries = await collect(single(archive));
  // Fail-closed: without the pax-path branch the file lands under the
  // truncated ustar name.
  t.deepEqual(
    entries.map(e => e.path),
    [longName],
  );
});

test('readTarEntries applies a global pax header across following entries', async t => {
  const longName = `${'global-pax-segment-'.repeat(6)}tail.txt`;
  t.true(longName.length > 100);
  const archive = concatBytes([
    paxHeader({ path: longName }, 'g'),
    tarEntry(longName.slice(0, 100), utf8.encode('payload'), '0'),
    new Uint8Array(TAR_BLOCK_SIZE * 2),
  ]);
  const entries = await collect(single(archive));
  // Fail-closed: without the global-pax branch the file lands under the
  // truncated ustar name.
  t.deepEqual(
    entries.map(e => e.path),
    [longName],
  );
});

test('readTarEntries assembles the ustar prefix and name', async t => {
  const archive = concatBytes([
    tarEntry('file.txt', utf8.encode('x'), '0', { prefix: 'deep/nested' }),
    new Uint8Array(TAR_BLOCK_SIZE * 2),
  ]);
  const entries = await collect(single(archive));
  t.is(entries[0].path, 'deep/nested/file.txt');
});

test('readTarEntries rejects an unsupported entry type', async t => {
  const archive = concatBytes([
    tarEntry('fifo', new Uint8Array(0), '6'), // typeflag 6 = FIFO
    new Uint8Array(TAR_BLOCK_SIZE * 2),
  ]);
  await t.throwsAsync(() => collect(single(archive)), {
    message: /Unsupported tar entry type/,
  });
});

test('readTarEntries streams a large file without buffering the whole archive', async t => {
  const large = new Uint8Array(4096).fill(98); // 8 content blocks
  const archive = concatBytes([
    tarEntry('a.txt', utf8.encode('a')),
    tarEntry('b.txt', large),
    new Uint8Array(TAR_BLOCK_SIZE * 2),
  ]);

  // Deliver in 64-byte slices and count how many have been pulled.
  let chunksPulled = 0;
  const sliceSize = 64;
  const totalSlices = Math.ceil(archive.byteLength / sliceSize);
  async function* sliced() {
    for (let offset = 0; offset < archive.byteLength; offset += sliceSize) {
      chunksPulled += 1;
      yield archive.slice(offset, offset + sliceSize);
    }
  }

  let aDoneAt = -1;
  let bChunks = 0;
  for await (const entry of readTarEntries(sliced())) {
    let entryChunks = 0;
    // eslint-disable-next-line no-unused-vars
    for await (const chunk of entry.content) {
      entryChunks += 1;
    }
    if (entry.path === 'a.txt') {
      aDoneAt = chunksPulled;
    } else if (entry.path === 'b.txt') {
      bChunks = entryChunks;
    }
  }

  // Fail-closed: a buffering reader would have pulled every slice before
  // the first entry's content completed.
  t.true(
    aDoneAt < totalSlices,
    `expected a.txt to finish before the archive was fully pulled (pulled ${aDoneAt} of ${totalSlices})`,
  );
  t.true(
    bChunks > 1,
    `expected b.txt to stream in multiple chunks, got ${bChunks}`,
  );
});
