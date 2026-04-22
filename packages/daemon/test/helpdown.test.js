import test from '@endo/ses-ava/prepare-endo.js';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  parseHelpdown,
  loadHelpTextFile,
  readHelpTextFileSync,
} from '../src/helpdown.js';

test('parseHelpdown returns empty array for empty string', t => {
  const entries = parseHelpdown('');
  t.deepEqual(entries, []);
});

test('parseHelpdown parses a single entity with overview', t => {
  const md = `# EndoDirectory - A naming hub for managing pet names.`;
  const entries = parseHelpdown(md);
  t.is(entries.length, 1);
  const [name, help] = entries[0];
  t.is(name, 'EndoDirectory');
  t.is(help[''], 'EndoDirectory - A naming hub for managing pet names.');
});

test('parseHelpdown extracts entity name before dash separator', t => {
  const md = `# Foo - some description`;
  const entries = parseHelpdown(md);
  t.is(entries[0][0], 'Foo');
});

test('parseHelpdown uses full header when no dash separator', t => {
  const md = `# JustAName`;
  const entries = parseHelpdown(md);
  t.is(entries[0][0], 'JustAName');
});

test('parseHelpdown parses methods under an entity', t => {
  const md = [
    '# EndoDirectory - A naming hub.',
    '',
    '## help(methodName?) -> string',
    '',
    '## has(...petNamePath) -> Promise<boolean>',
    '',
  ].join('\n');
  const entries = parseHelpdown(md);
  t.is(entries.length, 1);
  const [name, help] = entries[0];
  t.is(name, 'EndoDirectory');
  t.is(help.help, 'help(methodName?) -> string');
  t.is(help.has, 'has(...petNamePath) -> Promise<boolean>');
});

test('parseHelpdown captures body text under methods', t => {
  const md = [
    '# Foo - a thing.',
    '',
    '## bar(x) -> number',
    '',
    'Returns x doubled.',
    '',
  ].join('\n');
  const entries = parseHelpdown(md);
  const [, help] = entries[0];
  t.is(help.bar, 'bar(x) -> number\nReturns x doubled.');
});

test('parseHelpdown collapses blank lines between method signature and body', t => {
  const md = [
    '# Foo - a thing.',
    '',
    '## bar(x) -> number',
    '',
    '',
    '',
    'Body text here.',
    '',
  ].join('\n');
  const entries = parseHelpdown(md);
  const [, help] = entries[0];
  t.is(help.bar, 'bar(x) -> number\nBody text here.');
});

test('parseHelpdown preserves blank lines in entity overview', t => {
  const md = [
    '# Foo - a thing.',
    '',
    'A guest can:',
    '- Do stuff',
    '',
    '## bar() -> void',
  ].join('\n');
  const entries = parseHelpdown(md);
  const [, help] = entries[0];
  t.true(help[''].includes('\n\nA guest can:'));
});

test('parseHelpdown parses multiple entities', t => {
  const md = [
    '# Alpha - first entity.',
    '',
    '## foo() -> void',
    '',
    '# Beta - second entity.',
    '',
    '## bar() -> void',
    '',
  ].join('\n');
  const entries = parseHelpdown(md);
  t.is(entries.length, 2);
  t.is(entries[0][0], 'Alpha');
  t.is(entries[1][0], 'Beta');
  t.truthy(entries[0][1].foo);
  t.truthy(entries[1][1].bar);
});

test('parseHelpdown ignores headers inside fenced code blocks', t => {
  const md = [
    '# RealEntity - real.',
    '',
    '```',
    '# NotAnEntity - fake.',
    '## notAMethod() -> void',
    '```',
    '',
    '## actualMethod() -> void',
  ].join('\n');
  const entries = parseHelpdown(md);
  t.is(entries.length, 1);
  t.is(entries[0][0], 'RealEntity');
  t.truthy(entries[0][1].actualMethod);
  t.is(entries[0][1].NotAnEntity, undefined);
  t.is(entries[0][1].notAMethod, undefined);
});

test('parseHelpdown ignores headers inside tilde fenced code blocks', t => {
  const md = [
    '# RealEntity - real.',
    '',
    '~~~',
    '# FakeEntity - fake.',
    '~~~',
    '',
    '## method() -> void',
  ].join('\n');
  const entries = parseHelpdown(md);
  t.is(entries.length, 1);
  t.is(entries[0][0], 'RealEntity');
});

test('parseHelpdown ignores headers inside blockquotes', t => {
  const md = [
    '# RealEntity - real.',
    '',
    '> ## notAMethod() -> void',
    '',
    '## realMethod() -> void',
  ].join('\n');
  const entries = parseHelpdown(md);
  t.is(entries.length, 1);
  t.truthy(entries[0][1].realMethod);
  t.is(entries[0][1].notAMethod, undefined);
});

test('parseHelpdown handles the example from the task spec', t => {
  const md = [
    '# EndoDirectory - A naming hub for managing pet names and references.',
    '',
    '## help(methodName?) -> string',
    '',
    '## has(...petNamePath) -> Promise<boolean>',
    '',
    '# Mail Operations - Send and receive messages between agents.',
    '',
    '## handle() -> Handle',
    '',
    '## listMessages() -> Promise<Message[]>',
    '',
    '# EndoGuest - A confined agent with directory and mail capabilities.',
    '',
    'A guest can:',
    '- Manage pet names for values (directory operations)',
    '- Send and receive messages (mail operations)',
    '- Request capabilities from its host',
    '',
    '## help(methodName?) -> string',
    '',
    '## define(source, slots) -> Promise<any>',
  ].join('\n');
  const entries = parseHelpdown(md);
  t.is(entries.length, 3);

  t.is(entries[0][0], 'EndoDirectory');
  t.truthy(entries[0][1].help);
  t.truthy(entries[0][1].has);

  t.is(entries[1][0], 'Mail Operations');
  t.truthy(entries[1][1].handle);
  t.truthy(entries[1][1].listMessages);

  t.is(entries[2][0], 'EndoGuest');
  t.true(entries[2][1][''].includes('A guest can:'));
  t.truthy(entries[2][1].help);
  t.truthy(entries[2][1].define);
});

test('parseHelpdown trims trailing blank lines from method body', t => {
  const md = [
    '# Foo - a thing.',
    '',
    '## bar() -> void',
    '',
    'Some body.',
    '',
    '',
    '',
  ].join('\n');
  const entries = parseHelpdown(md);
  const [, help] = entries[0];
  t.false(help.bar.endsWith('\n'));
});

test('parseHelpdown handles method with no body', t => {
  const md = [
    '# Foo - a thing.',
    '',
    '## bar() -> void',
    '## baz() -> string',
  ].join('\n');
  const entries = parseHelpdown(md);
  const [, help] = entries[0];
  t.is(help.bar, 'bar() -> void');
  t.is(help.baz, 'baz() -> string');
});

test('parseHelpdown handles method header with special characters', t => {
  // Method header like "## @special" — the @ is not a \w char, so
  // extractMethodName falls back to trimmed header text.
  const md = ['# Entity - desc', '', '## @special', 'Some body'].join('\n');
  const entries = parseHelpdown(md);
  const [, help] = entries[0];
  t.true(typeof help['@special'] === 'string');
  t.true(help['@special'].includes('Some body'));
});

test('readHelpTextFileSync reads and parses a markdown file', t => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'helpdown-test-'));
  const tmpFile = path.join(tmpDir, 'test-help.md');
  fs.writeFileSync(
    tmpFile,
    ['# TestEntity - A test entity.', '', '## foo()', 'Does foo.'].join('\n'),
  );
  try {
    const helpMap = readHelpTextFileSync(new URL(`file://${tmpFile}`));
    t.true(helpMap instanceof Map);
    t.true(helpMap.has('TestEntity'));
    const help = helpMap.get('TestEntity');
    t.is(help[''], 'TestEntity - A test entity.');
    t.true(typeof help.foo === 'string');
    t.true(help.foo.includes('Does foo.'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('loadHelpTextFile returns async iterable of entries', async t => {
  await null;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'helpdown-test-'));
  const tmpFile = path.join(tmpDir, 'async-help.md');
  fs.writeFileSync(
    tmpFile,
    [
      '# Alpha - First.',
      '',
      '## a()',
      'Method a.',
      '',
      '# Beta - Second.',
      '',
      '## b()',
      'Method b.',
    ].join('\n'),
  );
  try {
    const results = [];
    for await (const entry of loadHelpTextFile(new URL(`file://${tmpFile}`))) {
      results.push(entry);
    }
    t.is(results.length, 2);
    t.is(results[0][0], 'Alpha');
    t.is(results[1][0], 'Beta');
    t.true(results[0][1].a.includes('Method a.'));
    t.true(results[1][1].b.includes('Method b.'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
