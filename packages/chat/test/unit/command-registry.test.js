// @ts-check

import '@endo/init/debug.js';

import test from 'ava';
import {
  COMMANDS,
  getCommandList,
  filterCommands,
  getCommand,
  getCommandsByCategory,
  getCategories,
} from '../../command-registry.js';

test('COMMANDS contains expected commands', t => {
  t.true('request' in COMMANDS);
  t.true('dismiss' in COMMANDS);
  t.true('dismiss-all' in COMMANDS);
  t.true('js' in COMMANDS);
  t.true('list' in COMMANDS);
  t.true('show' in COMMANDS);
  t.true('help' in COMMANDS);
});

test('each command has required properties', t => {
  for (const [name, cmd] of Object.entries(COMMANDS)) {
    t.is(cmd.name, name, `command ${name} has matching name property`);
    t.is(typeof cmd.label, 'string', `command ${name} has label`);
    t.is(typeof cmd.description, 'string', `command ${name} has description`);
    t.is(typeof cmd.category, 'string', `command ${name} has category`);
    t.true(
      ['inline', 'modal', 'immediate'].includes(cmd.mode),
      `command ${name} has valid mode`,
    );
    t.true(Array.isArray(cmd.fields), `command ${name} has fields array`);
  }
});

test('getCommandList returns sorted array', t => {
  const list = getCommandList();
  t.true(Array.isArray(list));
  t.true(list.length > 0);

  // Check sorted by name
  const names = list.map(cmd => cmd.name);
  const sortedNames = [...names].sort();
  t.deepEqual(names, sortedNames);
});

test('filterCommands matches by name prefix', t => {
  const results = filterCommands('re');
  const names = results.map(cmd => cmd.name);
  t.true(names.includes('request'));
  t.true(names.includes('remove'));
  t.true(names.includes('reject'));
  t.true(names.includes('resolve'));
  t.false(names.includes('list'));
});

test('filterCommands matches by alias prefix', t => {
  // 'ls' is an alias for 'list'
  const results = filterCommands('ls');
  t.is(results.length, 1);
  t.is(results[0].name, 'list');
});

test('filterCommands is case insensitive', t => {
  const lower = filterCommands('js');
  const upper = filterCommands('JS');
  t.deepEqual(lower, upper);
});

test('filterCommands with empty prefix returns all commands', t => {
  const all = filterCommands('');
  const list = getCommandList();
  t.is(all.length, list.length);
});

test('getCommand returns command by name', t => {
  const cmd = getCommand('show');
  t.truthy(cmd);
  t.is(cmd?.name, 'show');
});

test('getCommand returns command by alias', t => {
  // 'mv' is alias for 'move'
  const cmd = getCommand('mv');
  t.truthy(cmd);
  t.is(cmd?.name, 'move');

  // 'rm' is alias for 'remove'
  const rmCmd = getCommand('rm');
  t.truthy(rmCmd);
  t.is(rmCmd?.name, 'remove');

  // 'eval' is alias for 'js'
  const evalCmd = getCommand('eval');
  t.truthy(evalCmd);
  t.is(evalCmd?.name, 'js');
});

test('getCommand returns undefined for unknown command', t => {
  const cmd = getCommand('nonexistent');
  t.is(cmd, undefined);
});

test('getCommandsByCategory returns commands in category', t => {
  const messaging = getCommandsByCategory('messaging');
  t.true(messaging.length > 0);
  for (const cmd of messaging) {
    t.is(cmd.category, 'messaging');
  }

  const names = messaging.map(cmd => cmd.name);
  t.true(names.includes('request'));
  t.true(names.includes('dismiss'));
  t.true(names.includes('dismiss-all'));
  t.true(names.includes('adopt'));
});

test('getCommandsByCategory returns empty for unknown category', t => {
  const results = getCommandsByCategory('nonexistent');
  t.deepEqual(results, []);
});

test('getCategories returns sorted unique categories', t => {
  const categories = getCategories();
  t.true(Array.isArray(categories));
  t.true(categories.includes('messaging'));
  t.true(categories.includes('storage'));
  t.true(categories.includes('execution'));
  t.true(categories.includes('system'));

  // Check sorted
  const sorted = [...categories].sort();
  t.deepEqual(categories, sorted);

  // Check unique
  const unique = [...new Set(categories)];
  t.deepEqual(categories, unique);
});

test('command fields have required properties', t => {
  for (const cmd of Object.values(COMMANDS)) {
    for (const field of cmd.fields) {
      t.is(typeof field.name, 'string', `${cmd.name}.${field.name} has name`);
      t.is(typeof field.label, 'string', `${cmd.name}.${field.name} has label`);
      t.is(typeof field.type, 'string', `${cmd.name}.${field.name} has type`);

      const validTypes = [
        'petNamePath',
        'petNamePaths',
        'messageNumber',
        'text',
        'edgeName',
        'locator',
        'source',
        'endowments',
      ];
      t.true(
        validTypes.includes(field.type),
        `${cmd.name}.${field.name} has valid type: ${field.type}`,
      );
    }
  }
});

test('immediate commands have no fields', t => {
  const immediate = Object.values(COMMANDS).filter(
    cmd => cmd.mode === 'immediate',
  );
  t.true(immediate.length > 0);
  for (const cmd of immediate) {
    t.is(cmd.fields.length, 0, `immediate command ${cmd.name} has no fields`);
  }
});
