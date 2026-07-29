// @ts-check
import test from 'ava';

import { formatEntry, parseEntries } from '../src/entries.js';
import { assemblePath, loadFromJsonl } from '../src/reader.js';
import {
  entryId,
  loadTranscriptNodes,
  projectGraph,
  projectNode,
  topoOrder,
} from '../src/project.js';

/** @import { TranscriptNode } from '../types.js' */

/**
 * A small Lal-shaped transcript graph: a system root, one turn `m1` under it,
 * and two replies `m2` and `m3` that branch off `m1`.
 *
 * @returns {Map<string, TranscriptNode>}
 */
const makeGraph = () => {
  /** @type {Map<string, TranscriptNode>} */
  const nodes = new Map();
  nodes.set('root', {
    messageId: 'root',
    parentMessageId: null,
    messages: [{ role: 'system', content: 'You are Lal.' }],
  });
  nodes.set('m1', {
    messageId: 'm1',
    parentMessageId: 'root',
    messages: [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' },
    ],
  });
  nodes.set('m2', {
    messageId: 'm2',
    parentMessageId: 'm1',
    messages: [
      { role: 'user', content: 'branch A' },
      { role: 'assistant', content: 'A response' },
    ],
  });
  nodes.set('m3', {
    messageId: 'm3',
    parentMessageId: 'm1',
    messages: [
      { role: 'user', content: 'branch B' },
      { role: 'assistant', content: 'B response' },
    ],
  });
  return nodes;
};

test('topoOrder emits every parent before its children', t => {
  const order = topoOrder(makeGraph()).map(n => n.messageId);
  t.is(order.indexOf('root'), 0);
  t.true(order.indexOf('root') < order.indexOf('m1'));
  t.true(order.indexOf('m1') < order.indexOf('m2'));
  t.true(order.indexOf('m1') < order.indexOf('m3'));
  t.is(order.length, 4);
});

test('projectNode chains a node’s messages and links the first to its parent', t => {
  const { entries, lastEntryId } = projectNode(
    {
      messageId: 'm1',
      parentMessageId: 'root',
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi' },
      ],
    },
    { parentEntryId: 'root:0' },
  );
  t.is(entries[0].parentId, 'root:0');
  t.is(entries[0].id, entryId('m1', 0));
  t.is(
    entries[1].parentId,
    entryId('m1', 0),
    'second message chains to the first',
  );
  t.is(lastEntryId, entryId('m1', 1), 'the node’s identity is its last entry');
  t.is(
    entries[0].type === 'message' && entries[0]['endo:parentMessageId'],
    'root',
  );
});

test('a node with no messages passes its parent linkage through', t => {
  const { entries, lastEntryId } = projectNode(
    { messageId: 'alias', parentMessageId: 'm1', messages: [] },
    { parentEntryId: 'm1:1' },
  );
  t.deepEqual(entries, []);
  t.is(lastEntryId, 'm1:1');
});

test('projectGraph → serialize → parse → loadTranscriptNodes round-trips', t => {
  const nodes = makeGraph();
  const entries = projectGraph(nodes, { sessionId: 's1', createdAt: 123 });

  t.is(entries[0].type, 'header');

  const text = `${entries.map(formatEntry).join('\n')}\n`;
  const { entries: parsed } = parseEntries(text);
  const restored = loadTranscriptNodes(parsed);

  t.is(restored.size, nodes.size);
  for (const [id, original] of nodes) {
    const back = restored.get(id);
    t.truthy(back, `node ${id} survives the round trip`);
    t.is(back?.parentMessageId, original.parentMessageId);
    t.deepEqual(back?.messages, original.messages);
  }
});

test('assemblePath walks a branch from root to leaf', t => {
  const nodes = makeGraph();
  const entries = projectGraph(nodes, { sessionId: 's1', createdAt: 123 });
  const text = `${entries.map(formatEntry).join('\n')}\n`;
  const graph = loadFromJsonl(text);

  // The leaf of branch A is m2's last message entry.
  const path = assemblePath(graph, entryId('m2', 1));
  const contents = path.map(e =>
    e.type === 'message' ? e.message.content : e.type,
  );
  t.deepEqual(contents, [
    'You are Lal.',
    'hello',
    'hi there',
    'branch A',
    'A response',
  ]);
  // Branch B must not appear on branch A's path.
  t.false(contents.includes('branch B'));
});

test('non-standard roles project to custom entries and restore their message', t => {
  /** @type {Map<string, TranscriptNode>} */
  const nodes = new Map();
  nodes.set('v1', {
    messageId: 'v1',
    parentMessageId: null,
    messages: [{ role: 'value', content: [{ some: 'payload' }] }],
  });
  const entries = projectGraph(nodes, { sessionId: 's', createdAt: 1 });
  const custom = entries.find(e => e.type === 'custom');
  t.truthy(custom, 'a value-role message becomes a custom entry');
  t.is(custom?.type === 'custom' && custom.custom['endo:kind'], 'value');

  const restored = loadTranscriptNodes(entries);
  t.deepEqual(restored.get('v1')?.messages, [
    { role: 'value', content: [{ some: 'payload' }] },
  ]);
});

test('topoOrder handles a deep linear chain without overflowing the stack', t => {
  // A long agent session is a chain thousands of nodes deep; a recursive walk
  // would throw RangeError well before this length.
  /** @type {Map<string, TranscriptNode>} */
  const nodes = new Map();
  const depth = 50_000;
  for (let i = 0; i < depth; i += 1) {
    nodes.set(`m${i}`, {
      messageId: `m${i}`,
      parentMessageId: i === 0 ? null : `m${i - 1}`,
      messages: [{ role: 'user', content: `turn ${i}` }],
    });
  }
  const order = topoOrder(nodes);
  t.is(order.length, depth, 'every node is ordered, none dropped');
  t.is(order[0].messageId, 'm0');
  t.is(order[depth - 1].messageId, `m${depth - 1}`);
});

test('topoOrder terminates on a parentMessageId cycle instead of looping', t => {
  // A corrupt graph where two non-rooted nodes are each other's parent must not
  // spin; the visited guard bounds the walk.
  /** @type {Map<string, TranscriptNode>} */
  const nodes = new Map();
  nodes.set('root', {
    messageId: 'root',
    parentMessageId: null,
    messages: [{ role: 'system', content: 'ok' }],
  });
  nodes.set('a', {
    messageId: 'a',
    parentMessageId: 'b',
    messages: [{ role: 'user', content: 'a' }],
  });
  nodes.set('b', {
    messageId: 'b',
    parentMessageId: 'a',
    messages: [{ role: 'user', content: 'b' }],
  });
  const order = topoOrder(nodes);
  t.true(
    order.map(n => n.messageId).includes('root'),
    'the rooted node is ordered and the call returns rather than hanging',
  );
});

test('an alias node stored under a second key is projected only once', t => {
  const nodes = makeGraph();
  // Lal duplicates a node under the outbound messageId; the object identity and
  // canonical messageId are unchanged.
  const m1 = nodes.get('m1');
  if (m1 !== undefined) {
    nodes.set('m1-alias', m1);
  }
  const entries = projectGraph(nodes, { sessionId: 's', createdAt: 1 });
  const m1Entries = entries.filter(
    e => e.type === 'message' && e['endo:messageId'] === 'm1',
  );
  t.is(m1Entries.length, 2, 'm1’s two messages appear exactly once, not twice');
});
