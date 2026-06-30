import '@endo/init/debug.js';
import test from 'ava';
import { INVENTORY_GROUPS, groupForType } from '../src/commands/list.js';

// `endo list --grouped` buckets each pet name by its formula type using
// `groupForType`. This table is the CLI counterpart of the chat inventory's
// `groupKeyForType` (packages/space-chat/src/inventory/tree-source.js); the two
// must agree on every type→group mapping or the two surfaces present divergent
// inventories. These tests pin the mapping for every documented type.

test('handle types land in Handles', t => {
  t.is(groupForType('handle').key, 'handles');
  t.is(groupForType('handle').label, 'Handles');
});

test('guest types land in Agents', t => {
  t.is(groupForType('guest').key, 'agents');
  t.is(groupForType('guest').label, 'Agents');
});

test('host types land in Personas', t => {
  t.is(groupForType('host').key, 'personas');
  t.is(groupForType('host').label, 'Personas');
});

test('directory-shaped types land in Directories', t => {
  for (const type of [
    'directory',
    'readable-tree',
    'mount',
    'scratch-mount',
    'pet-store',
  ]) {
    t.is(
      groupForType(type).key,
      'directories',
      `${type} should bucket into Directories`,
    );
  }
});

test('marshal types land in Values', t => {
  t.is(groupForType('marshal').key, 'values');
  t.is(groupForType('marshal').label, 'Values');
});

test('worker and other unenumerated types fall through to Capabilities', t => {
  for (const type of [
    'worker',
    'readable-blob',
    'eval',
    'make-unconfined',
    'remote',
    'peer',
  ]) {
    t.is(
      groupForType(type).key,
      'capabilities',
      `${type} should bucket into Capabilities`,
    );
  }
});

test('an unknown formula type falls through to Capabilities', t => {
  t.is(groupForType('a-type-that-does-not-exist').key, 'capabilities');
});

test('an undefined type (no locator type) falls through to Capabilities', t => {
  t.is(groupForType(undefined).key, 'capabilities');
});

test('the manual group order is Handles, Directories, Values, Capabilities, Agents, Personas', t => {
  t.deepEqual(
    INVENTORY_GROUPS.map(group => group.key),
    ['handles', 'directories', 'values', 'capabilities', 'agents', 'personas'],
  );
});

test('the capabilities catch-all resolves by key, not array position', t => {
  // capabilities is no longer the last bucket (agents and personas follow it),
  // so the fallback must still find it for unenumerated/undefined types.
  t.is(groupForType('a-type-that-does-not-exist').key, 'capabilities');
  t.not(
    INVENTORY_GROUPS[INVENTORY_GROUPS.length - 1].key,
    'capabilities',
    'capabilities is intentionally not last in the manual order',
  );
});
