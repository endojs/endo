// @ts-nocheck - Test file

import '@endo/init/debug.js';

import test from 'ava';
import { computeLayout } from '../../moi-layout.js';

test('single message, no parent, no replies', t => {
  const messages = [{ id: 'a' }];
  const layout = computeLayout(messages, 'a');

  t.deepEqual(layout.get('a'), { indent: 0, lineType: 'none' });
});

test('MOI not found returns all none', t => {
  const messages = [{ id: 'a' }, { id: 'b' }];
  const layout = computeLayout(messages, 'missing');

  t.deepEqual(layout.get('a'), { indent: 0, lineType: 'none' });
  t.deepEqual(layout.get('b'), { indent: 0, lineType: 'none' });
});

test('MOI with parent', t => {
  const messages = [{ id: 'parent' }, { id: 'moi', replyTo: 'parent' }];
  const layout = computeLayout(messages, 'moi');

  t.deepEqual(layout.get('parent'), { indent: 0, lineType: 'continue' });
  t.deepEqual(layout.get('moi'), { indent: 0, lineType: 'continue' });
});

test('MOI with parent and intermediate message between them', t => {
  const messages = [
    { id: 'parent' },
    { id: 'inter' },
    { id: 'moi', replyTo: 'parent' },
  ];
  const layout = computeLayout(messages, 'moi');

  t.deepEqual(layout.get('parent'), { indent: 0, lineType: 'continue' });
  t.deepEqual(layout.get('inter'), { indent: 1, lineType: 'continue' });
  t.deepEqual(layout.get('moi'), { indent: 0, lineType: 'continue' });
});

test('MOI with one reply', t => {
  const messages = [{ id: 'moi' }, { id: 'reply', replyTo: 'moi' }];
  const layout = computeLayout(messages, 'moi');

  t.deepEqual(layout.get('moi'), { indent: 0, lineType: 'continue' });
  t.deepEqual(layout.get('reply'), { indent: 0, lineType: 'end' });
});

test('MOI with multiple replies, last flush, earlier indented', t => {
  const messages = [
    { id: 'moi' },
    { id: 'r1', replyTo: 'moi' },
    { id: 'r2', replyTo: 'moi' },
    { id: 'r3', replyTo: 'moi' },
  ];
  const layout = computeLayout(messages, 'moi');

  t.deepEqual(layout.get('moi'), { indent: 0, lineType: 'continue' });
  t.deepEqual(layout.get('r1'), { indent: 1, lineType: 'branch' });
  t.deepEqual(layout.get('r2'), { indent: 1, lineType: 'branch' });
  t.deepEqual(layout.get('r3'), { indent: 0, lineType: 'end' });
});

test('intermediate messages between MOI and replies are indented', t => {
  const messages = [
    { id: 'moi' },
    { id: 'inter1' },
    { id: 'r1', replyTo: 'moi' },
    { id: 'inter2' },
    { id: 'r2', replyTo: 'moi' },
  ];
  const layout = computeLayout(messages, 'moi');

  t.deepEqual(layout.get('moi'), { indent: 0, lineType: 'continue' });
  t.deepEqual(layout.get('inter1'), { indent: 1, lineType: 'continue' });
  t.deepEqual(layout.get('r1'), { indent: 1, lineType: 'branch' });
  t.deepEqual(layout.get('inter2'), { indent: 1, lineType: 'continue' });
  t.deepEqual(layout.get('r2'), { indent: 0, lineType: 'end' });
});

test('MOI with both parent and replies', t => {
  const messages = [
    { id: 'parent' },
    { id: 'moi', replyTo: 'parent' },
    { id: 'r1', replyTo: 'moi' },
  ];
  const layout = computeLayout(messages, 'moi');

  t.deepEqual(layout.get('parent'), { indent: 0, lineType: 'continue' });
  t.deepEqual(layout.get('moi'), { indent: 0, lineType: 'continue' });
  t.deepEqual(layout.get('r1'), { indent: 0, lineType: 'end' });
});

test('messages outside MOI chain get no lines', t => {
  const messages = [
    { id: 'unrelated1' },
    { id: 'moi' },
    { id: 'unrelated2' },
    { id: 'reply', replyTo: 'moi' },
    { id: 'unrelated3' },
  ];
  const layout = computeLayout(messages, 'moi');

  t.deepEqual(layout.get('unrelated1'), { indent: 0, lineType: 'none' });
  t.deepEqual(layout.get('moi'), { indent: 0, lineType: 'continue' });
  t.deepEqual(layout.get('unrelated2'), { indent: 1, lineType: 'continue' });
  t.deepEqual(layout.get('reply'), { indent: 0, lineType: 'end' });
  t.deepEqual(layout.get('unrelated3'), { indent: 0, lineType: 'none' });
});

test('MOI is first message', t => {
  const messages = [
    { id: 'moi' },
    { id: 'b' },
    { id: 'c', replyTo: 'moi' },
  ];
  const layout = computeLayout(messages, 'moi');

  t.deepEqual(layout.get('moi'), { indent: 0, lineType: 'continue' });
  t.deepEqual(layout.get('b'), { indent: 1, lineType: 'continue' });
  t.deepEqual(layout.get('c'), { indent: 0, lineType: 'end' });
});

test('MOI is last message', t => {
  const messages = [{ id: 'a' }, { id: 'b' }, { id: 'moi' }];
  const layout = computeLayout(messages, 'moi');

  t.deepEqual(layout.get('a'), { indent: 0, lineType: 'none' });
  t.deepEqual(layout.get('b'), { indent: 0, lineType: 'none' });
  t.deepEqual(layout.get('moi'), { indent: 0, lineType: 'none' });
});

test('parent not in message list is ignored gracefully', t => {
  const messages = [{ id: 'moi', replyTo: 'missing-parent' }];
  const layout = computeLayout(messages, 'moi');

  t.deepEqual(layout.get('moi'), { indent: 0, lineType: 'none' });
});

test('layout map covers all messages', t => {
  const messages = [
    { id: 'a' },
    { id: 'b' },
    { id: 'c', replyTo: 'b' },
    { id: 'd' },
  ];
  const layout = computeLayout(messages, 'b');

  t.is(layout.size, messages.length);
  for (const msg of messages) {
    t.truthy(layout.has(msg.id));
  }
});
