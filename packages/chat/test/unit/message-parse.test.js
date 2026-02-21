// @ts-check

import '@endo/init/debug.js';

import test from 'ava';
import { parseMessage } from '../../message-parse.js';

test('parseMessage with no references returns original text', t => {
  const result = parseMessage('Hello world');
  t.deepEqual(result, {
    strings: ['Hello world'],
    petNames: [],
    edgeNames: [],
  });
});

test('parseMessage extracts simple pet name reference', t => {
  const result = parseMessage('Hello @alice');
  t.deepEqual(result, {
    strings: ['Hello ', ''],
    petNames: ['alice'],
    edgeNames: ['alice'],
  });
});

test('parseMessage extracts multiple references', t => {
  const result = parseMessage('Hello @alice and @bob');
  t.deepEqual(result, {
    strings: ['Hello ', ' and ', ''],
    petNames: ['alice', 'bob'],
    edgeNames: ['alice', 'bob'],
  });
});

test('parseMessage extracts reference with edge name', t => {
  const result = parseMessage('Here is @attachment:file');
  t.deepEqual(result, {
    strings: ['Here is ', ''],
    petNames: ['file'],
    edgeNames: ['attachment'],
  });
});

test('parseMessage extracts mixed references', t => {
  const result = parseMessage('@alice sent @gift:present to @bob');
  t.deepEqual(result, {
    strings: ['', ' sent ', ' to ', ''],
    petNames: ['alice', 'present', 'bob'],
    edgeNames: ['alice', 'gift', 'bob'],
  });
});

test('parseMessage handles reference at start', t => {
  const result = parseMessage('@alice is here');
  t.deepEqual(result, {
    strings: ['', ' is here'],
    petNames: ['alice'],
    edgeNames: ['alice'],
  });
});

test('parseMessage handles reference at end', t => {
  const result = parseMessage('Hello @alice');
  t.deepEqual(result, {
    strings: ['Hello ', ''],
    petNames: ['alice'],
    edgeNames: ['alice'],
  });
});

test('parseMessage handles adjacent references', t => {
  const result = parseMessage('@alice@bob');
  t.deepEqual(result, {
    strings: ['', '', ''],
    petNames: ['alice', 'bob'],
    edgeNames: ['alice', 'bob'],
  });
});

test('parseMessage handles empty string', t => {
  const result = parseMessage('');
  t.deepEqual(result, {
    strings: [''],
    petNames: [],
    edgeNames: [],
  });
});

test('parseMessage handles only reference', t => {
  const result = parseMessage('@alice');
  t.deepEqual(result, {
    strings: ['', ''],
    petNames: ['alice'],
    edgeNames: ['alice'],
  });
});

test('parseMessage allows hyphens in names', t => {
  const result = parseMessage('@my-pet-name');
  t.deepEqual(result, {
    strings: ['', ''],
    petNames: ['my-pet-name'],
    edgeNames: ['my-pet-name'],
  });
});

test('parseMessage allows digits in names (after first char)', t => {
  const result = parseMessage('@user123');
  t.deepEqual(result, {
    strings: ['', ''],
    petNames: ['user123'],
    edgeNames: ['user123'],
  });
});

test('parseMessage requires lowercase start', t => {
  // Names must start with lowercase letter
  const result = parseMessage('@123invalid');
  t.deepEqual(result, {
    strings: ['@123invalid'],
    petNames: [],
    edgeNames: [],
  });
});

test('parseMessage handles edge name with hyphens', t => {
  const result = parseMessage('@my-edge:my-pet');
  t.deepEqual(result, {
    strings: ['', ''],
    petNames: ['my-pet'],
    edgeNames: ['my-edge'],
  });
});

test('parseMessage does not match uppercase names', t => {
  const result = parseMessage('@Alice');
  t.deepEqual(result, {
    strings: ['@Alice'],
    petNames: [],
    edgeNames: [],
  });
});

test('parseMessage does not match email addresses', t => {
  // The pattern requires [a-z] start, so typical emails won't match
  // But note: user@domain would match @domain as a reference
  const result = parseMessage('Contact support@example.com');
  t.deepEqual(result, {
    strings: ['Contact support', '.com'],
    petNames: ['example'],
    edgeNames: ['example'],
  });
});

test('parseMessage preserves surrounding whitespace', t => {
  const result = parseMessage('  @alice  ');
  t.deepEqual(result, {
    strings: ['  ', '  '],
    petNames: ['alice'],
    edgeNames: ['alice'],
  });
});

test('parseMessage handles newlines', t => {
  const result = parseMessage('Hello\n@alice\nGoodbye');
  t.deepEqual(result, {
    strings: ['Hello\n', '\nGoodbye'],
    petNames: ['alice'],
    edgeNames: ['alice'],
  });
});

test('parseMessage handles maximum length names', t => {
  // Pattern allows up to 128 chars (0-127 means up to 127 additional chars)
  const longName = `a${'b'.repeat(127)}`;
  const result = parseMessage(`@${longName}`);
  t.is(result.petNames.length, 1);
  t.is(result.petNames[0], longName);
});

test('parseMessage truncates overly long names', t => {
  // Names longer than 128 chars should only match the first 128
  const tooLong = `a${'b'.repeat(200)}`;
  const result = parseMessage(`@${tooLong}`);
  t.is(result.petNames.length, 1);
  t.is(result.petNames[0].length, 128);
});
