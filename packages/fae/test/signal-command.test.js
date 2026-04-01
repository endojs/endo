// @ts-check
import '@endo/init/debug.js';

import test from 'ava';

import {
  parsePetNamePathArg,
  parseSignalInput,
  parseSignalReferences,
} from '../src/signal-command.js';

test('parseSignalInput parses slash command', t => {
  const parsed = parseSignalInput('/enter alice/handle');
  t.deepEqual(parsed, {
    type: 'command',
    name: 'enter',
    args: 'alice/handle',
  });
});

test('parseSignalInput parses plain message', t => {
  const parsed = parseSignalInput('hello there');
  t.deepEqual(parsed, {
    type: 'message',
    text: 'hello there',
  });
});

test('parsePetNamePathArg splits slash paths', t => {
  t.deepEqual(parsePetNamePathArg('alpha/beta/gamma'), [
    'alpha',
    'beta',
    'gamma',
  ]);
});

test('parseSignalReferences extracts @petname tokens', t => {
  const parsed = parseSignalReferences('hi @alice and @tools/math');
  t.deepEqual(parsed, {
    strings: ['hi ', ' and ', ''],
    edgeNames: ['alice', 'tools-math'],
    petNames: ['alice', 'tools/math'],
  });
});

