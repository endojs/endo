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
  t.true('clear' in COMMANDS);
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
  t.true(names.includes('clear'));
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
        'message',
        'text',
        'edgeName',
        'locator',
        'source',
        'endowments',
        'select',
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

// ============ CONTEXT FILTERING TESTS ============

test('inbox-only commands have context set to inbox', t => {
  const inboxOnly = [
    'request',
    'dismiss',
    'clear',
    'resolve',
    'reject',
    'form',
    'submit',
    'approve-eval',
  ];
  for (const name of inboxOnly) {
    t.is(COMMANDS[name].context, 'inbox', `${name} should be inbox-only`);
  }
});

test('commands without context are available in both modes', t => {
  const bothModes = [
    'adopt',
    'reply',
    'js',
    'list',
    'show',
    'remove',
    'move',
    'copy',
    'mkdir',
    'checkin',
    'checkout',
    'mount',
    'mktmp',
    'invite',
    'accept',
    'spawn',
    'cancel',
    'help',
  ];
  for (const name of bothModes) {
    const cmd = COMMANDS[name];
    t.true(
      cmd.context === undefined || cmd.context === 'both',
      `${name} should be available in both modes (context=${cmd.context})`,
    );
  }
});

test('filterCommands with inbox context excludes channel-only commands', t => {
  // Currently no channel-only commands, but ensure inbox context works
  const results = filterCommands('', 'inbox');
  for (const cmd of results) {
    const cmdContext = cmd.context || 'both';
    t.true(
      cmdContext === 'both' || cmdContext === 'inbox',
      `${cmd.name} should be available in inbox context`,
    );
  }
});

test('filterCommands with channel context excludes inbox-only commands', t => {
  const results = filterCommands('', 'channel');
  const names = results.map(cmd => cmd.name);

  // Inbox-only commands should be excluded
  t.false(names.includes('request'));
  t.false(names.includes('dismiss'));
  t.false(names.includes('clear'));
  t.false(names.includes('resolve'));
  t.false(names.includes('reject'));
  t.false(names.includes('form'));
  t.false(names.includes('submit'));
  t.false(names.includes('approve-eval'));

  // Both-mode commands should be included
  t.true(names.includes('adopt'));
  t.true(names.includes('reply'));
  t.true(names.includes('list'));
  t.true(names.includes('show'));
  t.true(names.includes('js'));
  t.true(names.includes('help'));
});

test('filterCommands without context returns all commands', t => {
  const withContext = filterCommands('');
  const list = getCommandList();
  t.is(withContext.length, list.length);
});

test('filterCommands with channel context and prefix', t => {
  const results = filterCommands('ad', 'channel');
  const names = results.map(cmd => cmd.name);
  t.true(names.includes('adopt'));
  // adopt-locator should also match if present
});

test('filterCommands with inbox context and prefix includes inbox commands', t => {
  const results = filterCommands('re', 'inbox');
  const names = results.map(cmd => cmd.name);
  t.true(names.includes('request'));
  t.true(names.includes('resolve'));
  t.true(names.includes('reject'));
  t.true(names.includes('remove'));
  t.true(names.includes('reply'));
});

// ============ CHECKIN / CHECKOUT TESTS ============

test('COMMANDS contains checkin and checkout', t => {
  t.true('checkin' in COMMANDS);
  t.true('checkout' in COMMANDS);
});

test('checkin command has correct properties', t => {
  const cmd = COMMANDS.checkin;
  t.is(cmd.name, 'checkin');
  t.is(cmd.category, 'storage');
  t.is(cmd.mode, 'inline');
  t.deepEqual(cmd.aliases, ['ci']);
  t.is(cmd.fields.length, 1);
  t.is(cmd.fields[0].name, 'petName');
  t.is(cmd.fields[0].type, 'petNamePath');
  t.true(cmd.fields[0].required);
});

test('checkout command has correct properties', t => {
  const cmd = COMMANDS.checkout;
  t.is(cmd.name, 'checkout');
  t.is(cmd.category, 'storage');
  t.is(cmd.mode, 'inline');
  t.deepEqual(cmd.aliases, ['co']);
  t.is(cmd.fields.length, 1);
  t.is(cmd.fields[0].name, 'petName');
  t.is(cmd.fields[0].type, 'petNamePath');
  t.true(cmd.fields[0].required);
});

test('getCommand resolves ci alias to checkin', t => {
  const cmd = getCommand('ci');
  t.truthy(cmd);
  t.is(cmd?.name, 'checkin');
});

test('getCommand resolves co alias to checkout', t => {
  const cmd = getCommand('co');
  t.truthy(cmd);
  t.is(cmd?.name, 'checkout');
});

test('filterCommands matches checkin by prefix', t => {
  const results = filterCommands('check');
  const names = results.map(cmd => cmd.name);
  t.true(names.includes('checkin'));
  t.true(names.includes('checkout'));
});

test('checkin, checkout, and mount appear in storage category', t => {
  const storage = getCommandsByCategory('storage');
  const names = storage.map(cmd => cmd.name);
  t.true(names.includes('checkin'));
  t.true(names.includes('checkout'));
  t.true(names.includes('mount'));
});

test('mktmp command exists', t => {
  const cmd = getCommand('mktmp');
  t.truthy(cmd);
  t.is(cmd?.name, 'mktmp');
});

test('mount command has path and petName fields', t => {
  const cmd = COMMANDS.mount;
  t.is(cmd.name, 'mount');
  t.is(cmd.category, 'storage');
  t.is(cmd.mode, 'inline');
  t.is(cmd.fields.length, 2);
  t.is(cmd.fields[0].name, 'path');
  t.is(cmd.fields[1].name, 'petName');
  t.true(cmd.fields[0].required);
  t.true(cmd.fields[1].required);
});

test('mktmp command has correct properties', t => {
  const cmd = COMMANDS.mktmp;
  t.is(cmd.name, 'mktmp');
  t.is(cmd.category, 'storage');
});

test('getCommandsByCategory respects context filter', t => {
  const messagingInbox = getCommandsByCategory('messaging', 'inbox');
  const messagingChannel = getCommandsByCategory('messaging', 'channel');

  // Inbox should include inbox-only commands like request, dismiss
  const inboxNames = messagingInbox.map(cmd => cmd.name);
  t.true(inboxNames.includes('request'));
  t.true(inboxNames.includes('dismiss'));
  t.true(inboxNames.includes('adopt'));

  // Channel should exclude inbox-only commands
  const channelNames = messagingChannel.map(cmd => cmd.name);
  t.false(channelNames.includes('request'));
  t.false(channelNames.includes('dismiss'));
  t.true(channelNames.includes('adopt'));
  t.true(channelNames.includes('reply'));
});
