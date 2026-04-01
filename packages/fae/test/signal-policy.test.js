// @ts-check

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
    harden({ groupMentionPrefix: '@endo-bot', agentForSender: {} }),
    harden({
      source: '+10000000000',
      text: 'hello',
    }),
  );
  t.false(decision.accepted);
  if (!decision.accepted) {
    t.regex(decision.reason, /configured daemon agent/u);
  }
});

test('policy accepts direct sender with configured agent', t => {
  const decision = applySignalInboundPolicy(
    harden({
      groupMentionPrefix: '@endo-bot',
      agentForSender: { '+10000000000': 'fae-agent' },
    }),
    harden({
      source: '+10000000000',
      text: 'hello there',
    }),
  );
  t.true(decision.accepted);
  if (decision.accepted) {
    t.is(decision.agentName, 'fae-agent');
    t.is(decision.text, 'hello there');
    t.false(decision.isGroup);
  }
});

test('policy enforces group leading mention', t => {
  const config = harden({
    groupMentionPrefix: '@endo-bot',
    agentForSender: { '+10000000000': 'fae-agent' },
  });
  const missingMention = applySignalInboundPolicy(
    config,
    harden({
      source: '+10000000000',
      groupId: 'group-1',
      text: 'hello in group',
    }),
  );
  t.false(missingMention.accepted);

  const withMention = applySignalInboundPolicy(
    config,
    harden({
      source: '+10000000000',
      groupId: 'group-1',
      text: '@endo-bot: hello in group',
    }),
  );
  t.true(withMention.accepted);
  if (withMention.accepted) {
    t.true(withMention.isGroup);
    t.is(withMention.text, 'hello in group');
  }
});
