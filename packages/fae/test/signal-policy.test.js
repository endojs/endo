// @ts-check

import '@endo/init/debug.js';

import test from 'ava';

import {
  applySignalInboundPolicy,
  stripLeadingGroupMention,
} from '../src/signal-policy.js';

test('stripLeadingGroupMention removes prefix and punctuation', t => {
  t.is(stripLeadingGroupMention('@endo-bot: hello', '@endo-bot'), 'hello');
  t.is(stripLeadingGroupMention('@endo-bot, hello', '@endo-bot'), 'hello');
  t.is(stripLeadingGroupMention('@endo-bot hello', '@endo-bot'), 'hello');
  t.is(stripLeadingGroupMention('hello @endo-bot', '@endo-bot'), undefined);
});

test('policy rejects sender without configured agent', t => {
  const decision = applySignalInboundPolicy(
    { groupMentionPrefix: '@endo-bot', agentForSender: {} },
    {
      source: '+10000000000',
      text: 'hello',
    },
  );
  t.false(decision.accepted);
  if (!decision.accepted) {
    t.regex(decision.reason, /configured daemon agent/u);
  }
});

test('policy accepts direct sender with configured agent', t => {
  const decision = applySignalInboundPolicy(
    {
      groupMentionPrefix: '@endo-bot',
      agentForSender: { '+10000000000': 'fae-agent' },
    },
    {
      source: '+10000000000',
      text: 'hello there',
    },
  );
  t.true(decision.accepted);
  if (decision.accepted) {
    t.is(decision.agentName, 'fae-agent');
    t.is(decision.text, 'hello there');
    t.false(decision.isGroup);
  }
});

test('policy enforces group leading mention', t => {
  const config = {
    groupMentionPrefix: '@endo-bot',
    agentForSender: { '+10000000000': 'fae-agent' },
  };
  const missingMention = applySignalInboundPolicy(
    config,
    {
      source: '+10000000000',
      groupId: 'group-1',
      text: 'hello in group',
    },
  );
  t.false(missingMention.accepted);

  const withMention = applySignalInboundPolicy(
    config,
    {
      source: '+10000000000',
      groupId: 'group-1',
      text: '@endo-bot: hello in group',
    },
  );
  t.true(withMention.accepted);
  if (withMention.accepted) {
    t.true(withMention.isGroup);
    t.is(withMention.text, 'hello in group');
  }
});
