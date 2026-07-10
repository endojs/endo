// @ts-check
import test from 'ava';

import {
  FORMAT_VERSION,
  formatEntry,
  isStandardRole,
  makeCustomEntry,
  makeHeaderEntry,
  makeMessageEntry,
  parseEntries,
  parseLine,
} from '../src/entries.js';

test('makeHeaderEntry defaults the version to the Pi v3 shape', t => {
  const header = makeHeaderEntry({ sessionId: 's1', createdAt: 10 });
  t.is(header.type, 'header');
  t.is(header.version, FORMAT_VERSION);
  t.is(FORMAT_VERSION, 3);
  t.is(header.sessionId, 's1');
});

test('makeMessageEntry only carries endo linkage when supplied', t => {
  const bare = makeMessageEntry(
    { role: 'user', content: 'hi' },
    { id: 'a:0', parentId: null },
  );
  t.deepEqual(Object.keys(bare).sort(), ['id', 'message', 'parentId', 'type']);

  const linked = makeMessageEntry(
    { role: 'assistant', content: 'yo' },
    {
      id: 'b:0',
      parentId: 'a:0',
      'endo:messageId': 'b',
      'endo:parentMessageId': 'a',
    },
  );
  t.is(linked['endo:messageId'], 'b');
  t.is(linked['endo:parentMessageId'], 'a');
});

test('isStandardRole distinguishes Pi roles from Endo-foreign kinds', t => {
  t.true(isStandardRole('system'));
  t.true(isStandardRole('user'));
  t.true(isStandardRole('assistant'));
  t.true(isStandardRole('tool'));
  t.false(isStandardRole('value'));
  t.false(isStandardRole('endo:whatever'));
});

test('formatEntry produces a single newline-free physical line', t => {
  const line = formatEntry(
    makeMessageEntry(
      { role: 'user', content: 'line one\nline two' },
      { id: 'a:0', parentId: null },
    ),
  );
  t.false(line.includes('\n'), 'embedded newline must be JSON-escaped');
  t.deepEqual(parseLine(line).type, 'message');
});

test('parseLine rejects non-typed objects', t => {
  t.throws(() => parseLine('42'));
  t.throws(() => parseLine('{"no":"type"}'));
  t.throws(() => parseLine('null'));
});

test('parseEntries skips blanks and recovers a torn final line', t => {
  const good = formatEntry(makeHeaderEntry({ sessionId: 's', createdAt: 1 }));
  const custom = formatEntry(
    makeCustomEntry('value', { id: 'c:0', parentId: null }),
  );
  // A crash left a torn line with no trailing newline.
  const text = `${good}\n\n${custom}\n{"type":"message","id":"torn`;
  const { entries, trailingPartial } = parseEntries(text);
  t.is(entries.length, 2, 'the torn line is dropped, blanks skipped');
  t.is(entries[0].type, 'header');
  t.is(entries[1].type, 'custom');
  t.is(trailingPartial, '{"type":"message","id":"torn');
});

test('parseEntries treats a clean newline-terminated file as fully complete', t => {
  const line = formatEntry(makeHeaderEntry({ sessionId: 's', createdAt: 1 }));
  const { entries, trailingPartial } = parseEntries(`${line}\n`);
  t.is(entries.length, 1);
  t.is(trailingPartial, '');
});
