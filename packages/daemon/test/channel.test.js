// @ts-check
/* global process */

/** @import { ERef } from '@endo/far' */
/** @import { EndoHost } from '../src/types.js' */

// Establish a perimeter:
// eslint-disable-next-line import/order
import '@endo/init/debug.js';

import test from 'ava';
import url from 'url';
import path from 'path';
import { E } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';
import {
  start,
  stop,
  purge,
  makeEndoClient,
  makeRefIterator,
} from '../index.js';

const { raw } = String;

const dirname = url.fileURLToPath(new URL('..', import.meta.url)).toString();

/**
 * @param {AsyncIterator} asyncIterator - The iterator to take from.
 * @param {number} count - The number of values to retrieve.
 */
const takeCount = async (asyncIterator, count) => {
  const values = [];
  await null;
  // eslint-disable-next-line no-plusplus
  for (let i = 0; i < count; i++) {
    // eslint-disable-next-line no-await-in-loop
    const result = await asyncIterator.next();
    values.push(result.value);
  }
  return values;
};

/**
 * Get the author's proposed name for a channel message via getMember().
 * @param {any} channelRef - The channel or member ref.
 * @param {any} message - A channel message with memberId.
 * @returns {Promise<string>}
 */
const getAuthor = async (channelRef, message) => {
  const info = await E(channelRef).getMember(message.memberId);
  return info ? info.proposedName : message.memberId;
};

/**
 * Get the pedigree for a channel message via getMember().
 * @param {any} channelRef - The channel or member ref.
 * @param {any} message - A channel message with memberId.
 * @returns {Promise<string[]>}
 */
const getPedigree = async (channelRef, message) => {
  const info = await E(channelRef).getMember(message.memberId);
  return info ? info.pedigree : [];
};

const MAX_UNIX_SOCKET_PATH = 90;
let configPathId = 0;

/** @param {Array<string>} root */
const makeConfig = (...root) => {
  return {
    statePath: path.join(dirname, ...root, 'state'),
    ephemeralStatePath: path.join(dirname, ...root, 'run'),
    cachePath: path.join(dirname, ...root, 'cache'),
    sockPath:
      process.platform === 'win32'
        ? raw`\\?\pipe\endo-${root.join('-')}-test.sock`
        : path.join(dirname, ...root, 'endo.sock'),
    pets: new Map(),
    values: new Map(),
  };
};

/**
 * @param {ReturnType<makeConfig>} config
 * @param {Promise<void>} cancelled
 */
const makeHost = async (config, cancelled) => {
  const { getBootstrap } = await makeEndoClient(
    'client',
    config.sockPath,
    cancelled,
  );
  const bootstrap = getBootstrap();
  return { host: E(bootstrap).host() };
};

const SOCKET_PATH_OVERHEAD =
  path.join(dirname, 'tmp').length + 1 + 'endo.sock'.length + 8;
const MAX_CONFIG_DIR_LENGTH = Math.max(
  8,
  MAX_UNIX_SOCKET_PATH - SOCKET_PATH_OVERHEAD,
);

/**
 * @param {string} testTitle
 * @param {number} configNumber
 */
const getConfigDirectoryName = (testTitle, configNumber) => {
  const defaultPath = testTitle.replace(/\s/giu, '-').replace(/[^\w-]/giu, '');
  const basePath =
    defaultPath.length <= MAX_CONFIG_DIR_LENGTH
      ? defaultPath
      : defaultPath.slice(0, MAX_CONFIG_DIR_LENGTH);
  const testId = String(configPathId).padStart(4, '0');
  const configId = String(configNumber).padStart(2, '0');
  const configSubDirectory = `${basePath}#${testId}-${configId}`;
  configPathId += 1;
  return configSubDirectory;
};

// Bind APPS web server to an OS-assigned port so tests don't conflict
// with a running daemon on the default port 8920.
process.env.ENDO_ADDR = '127.0.0.1:0';

/** @param {import('ava').ExecutionContext<any>} t */
const prepareConfig = async t => {
  const { reject: cancel, promise: cancelled } = makePromiseKit();
  const config = makeConfig(
    'tmp',
    getConfigDirectoryName(t.title, t.context.length),
  );
  await purge(config);
  await start(config);
  const contextObj = { cancel, cancelled, config };
  t.context.push(contextObj);
  return { ...contextObj };
};

/** @param {import('ava').ExecutionContext<any>} t */
const prepareHost = async t => {
  const { cancel, cancelled, config } = await prepareConfig(t);
  const { host } = await makeHost(config, cancelled);
  return { cancel, cancelled, config, host };
};

test.beforeEach(t => {
  t.context = [];
});

test.afterEach.always(async t => {
  await Promise.allSettled(
    /** @type {any[]} */ (t.context).flatMap(
      ({ cancel, cancelled, config }) => {
        cancel(Error('teardown'));
        return [cancelled, stop(config)];
      },
    ),
  );
});

// ---------- Smoke test: full end-to-end channel lifecycle ----------
// This test exercises the complete flow that the UI uses:
// create persona → create channel → join → post → follow → verify messages.
// If this test breaks, basic messaging is broken.

test.serial(
  'smoke: full channel lifecycle - create, join, post, follow, getMemberId',
  async t => {
    const { host } = await prepareHost(t);

    // 1. Create a persona (like the UI does when creating a channel space)
    const spaceName = 'smoke-space';
    const agentName = `persona-for-${spaceName}`;
    await E(host).provideHost(spaceName, { agentName });
    const personaPowers = await E(host).lookup(agentName);

    // 2. Create a channel within the persona
    await E(personaPowers).makeChannel('general', 'Alice');
    const channel = await E(personaPowers).lookup('general');
    t.truthy(channel, 'channel exists');

    // 3. Admin can post and see the message
    await E(channel).post(['Hello from admin'], [], []);
    const adminMessages = await E(channel).listMessages();
    t.is(adminMessages.length, 1);
    t.deepEqual(adminMessages[0].strings, ['Hello from admin']);
    t.is(await getAuthor(channel, adminMessages[0]), 'Alice');

    // 4. Admin can get their memberId
    const adminMemberId = await E(channel).getMemberId();
    t.is(adminMemberId, '0', 'admin memberId is "0"');
    t.is(
      adminMessages[0].memberId,
      adminMemberId,
      'message memberId matches admin getMemberId',
    );

    // 5. Join as a member (simulating a non-admin user)
    await E(channel).createInvitation('Bob');
    const member = await E(channel).join('Bob');
    t.truthy(member, 'join returns a member ref');

    // 6. Member can get their memberId
    const bobMemberId = await E(member).getMemberId();
    t.is(typeof bobMemberId, 'string');
    t.not(bobMemberId, adminMemberId, 'member has different ID than admin');

    // 7. Member can post
    await E(member).post(['Hello from Bob'], [], []);

    // 8. Follow messages and verify both messages appear
    const messagesRef = await E(channel).followMessages();
    const iter = makeRefIterator(messagesRef);
    const msg1 = await iter.next();
    const msg2 = await iter.next();
    t.is(msg1.value.strings[0], 'Hello from admin');
    t.is(msg1.value.memberId, adminMemberId);
    t.is(msg2.value.strings[0], 'Hello from Bob');
    t.is(msg2.value.memberId, bobMemberId);

    // 9. Join again (idempotent) — same member, same memberId
    const member2 = await E(channel).join('Bob');
    t.is(member2, member, 'join is idempotent');
    const bobMemberId2 = await E(member2).getMemberId();
    t.is(bobMemberId2, bobMemberId, 'stable memberId across joins');

    // 10. Post after re-join uses same memberId
    await E(member2).post(['Hello again from Bob'], [], []);
    const allMessages = await E(channel).listMessages();
    t.is(allMessages.length, 3);
    t.is(
      allMessages[2].memberId,
      bobMemberId,
      'post after re-join uses same memberId',
    );
  },
);

// ---------- Channel basics ----------

test.serial('channel - create and post message as admin', async t => {
  const { host } = await prepareHost(t);

  // Create a channel with the admin's display name
  await E(host).makeChannel('my-channel', 'Alice');

  // Look up the channel
  const channel = await E(host).lookup('my-channel');
  t.truthy(channel, 'channel should exist');

  // Post a message
  await E(channel).post(['Hello, world!'], [], []);

  // List messages
  const messages = await E(channel).listMessages();
  t.is(messages.length, 1, 'should have one message');
  t.is(
    await getAuthor(channel, messages[0]),
    'Alice',
    'author should be the admin display name',
  );
  t.deepEqual(messages[0].strings, ['Hello, world!']);
  t.deepEqual(
    await getPedigree(channel, messages[0]),
    [],
    'admin has empty pedigree',
  );
});

test.serial('channel - admin can invite a member', async t => {
  const { host } = await prepareHost(t);

  await E(host).makeChannel('my-channel', 'Alice');
  const channel = await E(host).lookup('my-channel');

  // Invite a member — returns [invitation, attenuator]
  const inviteResult = await E(channel).createInvitation('Bob');
  t.is(
    inviteResult.length,
    2,
    'createInvitation should return a [invitation, attenuator] pair',
  );
  const [bobInvite, bobAttenuator] = inviteResult;
  t.truthy(bobInvite, 'first element is an invitation remotable');
  t.truthy(bobAttenuator, 'second element is the attenuator');
  const bobMember = await E(bobInvite).join('Bob');

  // Check proposed name
  const bobName = await E(bobMember).getProposedName();
  t.is(bobName, 'Bob');

  // Check members list — getMembers returns only directly invited members
  const members = await E(channel).getMembers();
  t.is(
    members.length,
    1,
    'should have only Bob (admin self-entry is not included)',
  );
  t.is(members[0].proposedName, 'Bob');
  t.deepEqual(members[0].pedigree, ['Alice'], 'Bob was invited by Alice');
});

test.serial(
  'channel - member posts appear with correct author and pedigree',
  async t => {
    const { host } = await prepareHost(t);

    await E(host).makeChannel('my-channel', 'Alice');
    const channel = await E(host).lookup('my-channel');

    // Admin posts
    await E(channel).post(['Admin message'], [], []);

    // Invite Bob and have Bob post
    const [bobInvite] = await E(channel).createInvitation('Bob');
    const bobMember = await E(bobInvite).join('Bob');
    await E(bobMember).post(['HELLO!'], [], []);

    // List all messages
    const messages = await E(channel).listMessages();
    t.is(messages.length, 2);

    // Admin's message
    t.is(await getAuthor(channel, messages[0]), 'Alice');
    t.deepEqual(await getPedigree(channel, messages[0]), []);
    t.deepEqual(messages[0].strings, ['Admin message']);

    // Bob's message
    t.is(await getAuthor(channel, messages[1]), 'Bob');
    t.deepEqual(await getPedigree(channel, messages[1]), ['Alice']);
    t.deepEqual(messages[1].strings, ['HELLO!']);
  },
);

test.serial(
  'channel - member sees same messages as admin via followMessages',
  async t => {
    const { host } = await prepareHost(t);

    await E(host).makeChannel('my-channel', 'Alice');
    const channel = await E(host).lookup('my-channel');

    // Admin posts first
    await E(channel).post(['First message'], [], []);

    // Invite Bob
    const [bobInvite] = await E(channel).createInvitation('Bob');
    const bobMember = await E(bobInvite).join('Bob');

    // Bob follows messages — should see existing messages
    const bobIteratorRef = await E(bobMember).followMessages();
    const bobIterator = makeRefIterator(bobIteratorRef);

    // Take the first existing message
    const [firstMsg] = await takeCount(bobIterator, 1);
    t.is(await getAuthor(bobMember, firstMsg), 'Alice');
    t.deepEqual(firstMsg.strings, ['First message']);

    // Bob posts
    await E(bobMember).post(['HELLO!'], [], []);

    // Bob should see his own message via the iterator
    const [bobMsg] = await takeCount(bobIterator, 1);
    t.is(await getAuthor(bobMember, bobMsg), 'Bob');
    t.deepEqual(bobMsg.strings, ['HELLO!']);
  },
);

test.serial(
  'channel - admin sees member messages via followMessages',
  async t => {
    const { host } = await prepareHost(t);

    await E(host).makeChannel('my-channel', 'Alice');
    const channel = await E(host).lookup('my-channel');

    // Start following before any messages
    const adminIteratorRef = await E(channel).followMessages();
    const adminIterator = makeRefIterator(adminIteratorRef);

    // Invite Bob and have Bob post
    const [bobInvite] = await E(channel).createInvitation('Bob');
    const bobMember = await E(bobInvite).join('Bob');
    await E(bobMember).post(['HELLO!'], [], []);

    // Admin should see Bob's message
    const [bobMsg] = await takeCount(adminIterator, 1);
    t.is(await getAuthor(channel, bobMsg), 'Bob');
    t.deepEqual(bobMsg.strings, ['HELLO!']);
    t.deepEqual(
      await getPedigree(channel, bobMsg),
      ['Alice'],
      'pedigree shows invited by Alice',
    );
  },
);

// ---------- Pedigree chains ----------

test.serial('channel - sub-invitations carry full pedigree chain', async t => {
  const { host } = await prepareHost(t);

  await E(host).makeChannel('my-channel', 'Alice');
  const channel = await E(host).lookup('my-channel');

  // Alice invites Bob
  const [bobInvite] = await E(channel).createInvitation('Bob');
  const bobMember = await E(bobInvite).join('Bob');
  // Bob invites Carol
  const [carolInvite] = await E(bobMember).createInvitation('Carol');
  const carolMember = await E(carolInvite).join('Carol');

  // Carol posts
  await E(carolMember).post(['Hi from Carol!'], [], []);

  const messages = await E(channel).listMessages();
  t.is(messages.length, 1);
  t.is(await getAuthor(channel, messages[0]), 'Carol');
  t.deepEqual(
    await getPedigree(channel, messages[0]),
    ['Alice', 'Bob'],
    'pedigree shows full invitation chain',
  );
});

// ---------- Implicit threading ----------

test.serial('channel - implicit threading with replyTo', async t => {
  const { host } = await prepareHost(t);

  await E(host).makeChannel('my-channel', 'Alice');
  const channel = await E(host).lookup('my-channel');

  // First message (no replyTo)
  await E(channel).post(['First'], [], []);

  // Second message replying to the first
  const messages1 = await E(channel).listMessages();
  const firstNumber = String(messages1[0].number);
  await E(channel).post(['Reply to first'], [], [], firstNumber);

  const messages2 = await E(channel).listMessages();
  t.is(messages2.length, 2);
  t.is(messages2[0].replyTo, undefined, 'first message has no replyTo');
  t.is(messages2[1].replyTo, firstNumber, 'second message replies to first');
});

// ---------- Attenuator ----------

test.serial('channel - disabled member cannot post', async t => {
  const { host } = await prepareHost(t);

  await E(host).makeChannel('my-channel', 'Alice');
  const channel = await E(host).lookup('my-channel');

  const [bobInvite, bobAttenuator] = await E(channel).createInvitation('Bob');
  const bobMember = await E(bobInvite).join('Bob');

  // Bob posts successfully
  await E(bobMember).post(['Before disable'], [], []);

  // Disable Bob via the attenuator
  await E(bobAttenuator).setInvitationValidity(false);

  // Bob tries to post — should fail
  await t.throwsAsync(
    () => E(bobMember).post(['After disable'], [], []),
    { message: /disabled/ },
    'disabled member should not be able to post',
  );
});

test.serial('channel - disabled member cannot follow messages', async t => {
  const { host } = await prepareHost(t);

  await E(host).makeChannel('my-channel', 'Alice');
  const channel = await E(host).lookup('my-channel');

  const [bobInvite, bobAttenuator] = await E(channel).createInvitation('Bob');
  const bobMember = await E(bobInvite).join('Bob');
  await E(bobAttenuator).setInvitationValidity(false);

  await t.throwsAsync(
    () => E(bobMember).followMessages(),
    { message: /disabled/ },
    'disabled member should not be able to follow messages',
  );
});

test.serial('channel - attenuator disables the correct member', async t => {
  const { host } = await prepareHost(t);

  await E(host).makeChannel('my-channel', 'Alice');
  const channel = await E(host).lookup('my-channel');

  const [bobInvite, bobAttenuator] = await E(channel).createInvitation('Bob');
  const bobMember = await E(bobInvite).join('Bob');
  await E(channel).createInvitation('Carol');

  await E(bobAttenuator).setInvitationValidity(false);

  // Bob should be disabled
  await t.throwsAsync(() => E(bobMember).post(['test'], [], []), {
    message: /disabled/,
  });

  // Members list should show Bob as inactive
  const members = await E(channel).getMembers();
  const bob = members.find(m => m.proposedName === 'Bob');
  t.is(bob?.active, false, 'Bob should be inactive');
  const carol = members.find(m => m.proposedName === 'Carol');
  t.is(carol?.active, true, 'Carol should still be active');
});

// ---------- Attenuated proxy pattern ----------

test.serial(
  'channel - createInvitation returns [invitation, attenuator] pair',
  async t => {
    const { host } = await prepareHost(t);

    await E(host).makeChannel('my-channel', 'Alice');
    const channel = await E(host).lookup('my-channel');

    const result = await E(channel).createInvitation('Bob');
    t.is(result.length, 2, 'createInvitation returns a pair');
    const [invitation, attenuator] = result;
    t.truthy(invitation, 'first element is an invitation remotable');
    t.truthy(attenuator, 'second element is the attenuator');

    // Join via invitation to get a member proxy
    const proxy = await E(invitation).join('Bob');

    // Proxy should have channel member methods
    const name = await E(proxy).getProposedName();
    t.is(name, 'Bob');
    const id = await E(proxy).getMemberId();
    t.truthy(id);
  },
);

test.serial('channel - disabled proxy throws on all operations', async t => {
  const { host } = await prepareHost(t);

  await E(host).makeChannel('my-channel', 'Alice');
  const channel = await E(host).lookup('my-channel');

  const [bobInvite, attenuator] = await E(channel).createInvitation('Bob');
  const proxy = await E(bobInvite).join('Bob');

  // Works before disabling
  await E(proxy).post(['Before disable'], [], []);

  // Disable via attenuator
  await E(attenuator).setInvitationValidity(false);

  // All operations should fail
  await t.throwsAsync(
    () => E(proxy).post(['After disable'], [], []),
    { message: /disabled/ },
    'error message indicates disabled',
  );

  await t.throwsAsync(() => E(proxy).getProposedName(), {
    message: /disabled/,
  });

  await t.throwsAsync(() => E(proxy).getMemberId(), { message: /disabled/ });
});

test.serial('channel - delegation chain cascades disabling', async t => {
  const { host } = await prepareHost(t);

  await E(host).makeChannel('my-channel', 'Alice');
  const channel = await E(host).lookup('my-channel');

  // Alice invites Bob
  const [bobInvite, bobAttenuator] = await E(channel).createInvitation('Bob');
  const bobProxy = await E(bobInvite).join('Bob');

  // Bob invites Carol
  const [carolInvite] = await E(bobProxy).createInvitation('Carol');
  const carolProxy = await E(carolInvite).join('Carol');

  // Both can post
  await E(bobProxy).post(['Bob here'], [], []);
  await E(carolProxy).post(['Carol here'], [], []);

  // Disable Bob — Carol should also be unable to operate
  await E(bobAttenuator).setInvitationValidity(false);

  await t.throwsAsync(
    () => E(bobProxy).post(['should fail'], [], []),
    { message: /disabled/ },
    'Bob is directly disabled',
  );

  await t.throwsAsync(
    () => E(carolProxy).post(['should also fail'], [], []),
    { message: /disabled/ },
    'Carol is cascadingly disabled because Bob (her ancestor) was disabled',
  );
});

// ---------- Disabling fully blocks view AND post ----------

test.serial(
  'channel - disabled proxy: existing follow stream stops yielding',
  async t => {
    const { host } = await prepareHost(t);

    await E(host).makeChannel('my-channel', 'Alice');
    const channel = await E(host).lookup('my-channel');

    const [bobInvite, bobAttenuator] = await E(channel).createInvitation('Bob');
    const bobProxy = await E(bobInvite).join('Bob');

    // Bob starts following messages BEFORE disabling
    const bobIteratorRef = await E(bobProxy).followMessages();
    const bobIterator = makeRefIterator(bobIteratorRef);

    // Admin posts a message — Bob should see it
    await E(channel).post(['Before disable'], [], []);
    const msg1 = await bobIterator.next();
    t.is(msg1.value.strings[0], 'Before disable');

    // Disable Bob
    await E(bobAttenuator).setInvitationValidity(false);

    // Admin posts another message — Bob should NOT see it
    await E(channel).post(['After disable'], [], []);

    // Bob's existing iterator should throw on next()
    await t.throwsAsync(
      () => bobIterator.next(),
      { message: /disabled/ },
      'existing follow stream should stop after disabling',
    );
  },
);

test.serial('channel - disabled proxy: listMessages throws', async t => {
  const { host } = await prepareHost(t);

  await E(host).makeChannel('my-channel', 'Alice');
  const channel = await E(host).lookup('my-channel');

  const [bobInvite, bobAttenuator] = await E(channel).createInvitation('Bob');
  const bobProxy = await E(bobInvite).join('Bob');

  // Bob can list messages before disabling
  await E(channel).post(['Hello'], [], []);
  const messagesBefore = await E(bobProxy).listMessages();
  t.is(messagesBefore.length, 1);

  // Disable Bob
  await E(bobAttenuator).setInvitationValidity(false);

  // Bob can no longer list messages
  await t.throwsAsync(
    () => E(bobProxy).listMessages(),
    { message: /disabled/ },
    'listMessages should throw after disabling',
  );
});

test.serial('channel - disabled proxy: post throws', async t => {
  const { host } = await prepareHost(t);

  await E(host).makeChannel('my-channel', 'Alice');
  const channel = await E(host).lookup('my-channel');

  const [bobInvite, bobAttenuator] = await E(channel).createInvitation('Bob');
  const bobProxy = await E(bobInvite).join('Bob');

  // Bob can post before disabling
  await E(bobProxy).post(['Hello from Bob'], [], []);

  // Disable Bob
  await E(bobAttenuator).setInvitationValidity(false);

  // Bob can no longer post
  await t.throwsAsync(
    () => E(bobProxy).post(['Should fail'], [], []),
    { message: /disabled/ },
    'post should throw after disabling',
  );
});

test.serial(
  'channel - disabled proxy: cascading disabling blocks existing follow stream',
  async t => {
    const { host } = await prepareHost(t);

    await E(host).makeChannel('my-channel', 'Alice');
    const channel = await E(host).lookup('my-channel');

    // Alice invites Bob, Bob invites Carol
    const [bobInvite, bobAttenuator] = await E(channel).createInvitation('Bob');
    const bobProxy = await E(bobInvite).join('Bob');
    const [carolInvite] = await E(bobProxy).createInvitation('Carol');
    const carolProxy = await E(carolInvite).join('Carol');

    // Carol starts following BEFORE Bob is disabled
    const carolIteratorRef = await E(carolProxy).followMessages();
    const carolIterator = makeRefIterator(carolIteratorRef);

    // Admin posts — Carol sees it
    await E(channel).post(['Before disable'], [], []);
    const msg1 = await carolIterator.next();
    t.is(msg1.value.strings[0], 'Before disable');

    // Disable Bob — Carol should also lose access (cascading)
    await E(bobAttenuator).setInvitationValidity(false);

    await E(channel).post(['After disable'], [], []);

    // Carol's existing iterator should throw
    await t.throwsAsync(
      () => carolIterator.next(),
      { message: /disabled/ },
      'cascading disabling should stop existing follow stream',
    );
  },
);

// ---------- UI flow: joined member creates invitation ----------
// This mimics the exact flow in channel-header.js handleInvite()
// when the user is NOT the channel admin.

test.serial(
  'channel - UI flow: joined member createInvitation returns [invitation, attenuator]',
  async t => {
    const { host } = await prepareHost(t);

    // 1. Admin creates a channel (like creating a channel space in the UI)
    const adminAgentName = 'persona-admin-ui';
    await E(host).provideHost('admin-space', { agentName: adminAgentName });
    const adminPowers = await E(host).lookup(adminAgentName);
    await E(adminPowers).makeChannel('general', 'AdminAlice');
    await E(adminPowers).lookup('general');

    // 2. Non-admin persona connects to the channel (like the UI's channel switch flow)
    const bobAgentName = 'persona-bob-ui';
    await E(host).provideHost('bob-space', { agentName: bobAgentName });
    const bobPowers = await E(host).lookup(bobAgentName);
    const channelId = await E(host).identify(adminAgentName, 'general');
    await E(bobPowers).write('channel', channelId);
    const bobChannelRef = await E(bobPowers).lookup('channel');

    // 3. Bob joins the channel (this is what chat.js does for non-admin users)
    await E(bobChannelRef).createInvitation('Bob');
    const bobMember = await E(bobChannelRef).join('Bob');
    t.truthy(bobMember, 'join returns a member ref');

    // 4. Bob creates an invitation via the member ref (this is the channel-header.js flow)
    const inviteResult = await E(bobMember).createInvitation('Carol');

    // 5. Verify the result is a proper array [invitation, attenuator]
    t.true(
      Array.isArray(inviteResult),
      'createInvitation result should be an Array',
    );
    t.is(
      inviteResult.length,
      2,
      'createInvitation result should have 2 elements',
    );

    const [carolInvite, carolAttenuator] = inviteResult;
    t.truthy(carolInvite, 'first element is the invitation');
    t.truthy(carolAttenuator, 'second element is the attenuator');
    const carolProxy = await E(carolInvite).join('Carol');

    // 6. Verify the proxy works
    const carolName = await E(carolProxy).getProposedName();
    t.is(carolName, 'Carol');
    await E(carolProxy).post(['Hello from Carol via Bob'], [], []);

    // 7. Verify the attenuator works
    await E(carolAttenuator).setInvitationValidity(false);
    await t.throwsAsync(() => E(carolProxy).post(['Should fail'], [], []), {
      message: /disabled/,
    });
  },
);

test.serial(
  'channel - UI flow: admin createInvitation returns [invitation, attenuator]',
  async t => {
    const { host } = await prepareHost(t);

    // Admin flow: channel ref used directly (not via join)
    const agentName = 'persona-admin-direct';
    await E(host).provideHost('admin-space', { agentName });
    const powers = await E(host).lookup(agentName);
    await E(powers).makeChannel('general', 'Alice');
    const channel = await E(powers).lookup('general');

    // This is the channel-header.js flow for admin users
    const inviteResult = await E(channel).createInvitation('Bob');

    t.true(
      Array.isArray(inviteResult),
      'createInvitation result should be an Array',
    );
    t.is(
      inviteResult.length,
      2,
      'createInvitation result should have 2 elements',
    );

    const [bobInvite, bobAttenuator] = inviteResult;
    t.truthy(bobInvite, 'first element is the invitation');
    t.truthy(bobAttenuator, 'second element is the attenuator');
    const bobProxy = await E(bobInvite).join('Bob');

    // Verify the proxy works
    const bobName = await E(bobProxy).getProposedName();
    t.is(bobName, 'Bob');
    await E(bobProxy).post(['Hello from Bob'], [], []);

    // Verify attenuator works
    await E(bobAttenuator).setInvitationValidity(false);
    await t.throwsAsync(() => E(bobProxy).post(['Should fail'], [], []), {
      message: /disabled/,
    });
  },
);

// ---------- Multi-persona scenario ----------

test.serial(
  'channel - persona creates channel, member posts with own identity',
  async t => {
    const { host } = await prepareHost(t);

    // --- Admin creates a channel inside a persona ---
    const adminAgentName = 'persona-for-admin-space';
    await E(host).provideHost('admin-space', { agentName: adminAgentName });
    const adminPowers = await E(host).lookup(adminAgentName);

    // Create channel inside admin's persona
    await E(adminPowers).makeChannel('channel', 'AdminAlice');
    const adminChannel = await E(adminPowers).lookup('channel');

    // Admin posts a greeting
    await E(adminChannel).post(['Welcome to the channel!'], [], []);

    // --- Admin invites Bob (returns [invitation, attenuator]) ---
    const [bobInvite] = await E(adminChannel).createInvitation('BobJoiner');
    const bobMember = await E(bobInvite).join('BobJoiner');

    // --- Bob posts "HELLO!" using the proxy member ref ---
    // In the real app, this proxy ref is what Bob receives via CapTP
    // after the invitation locator is resolved.
    await E(bobMember).post(['HELLO!'], [], []);

    // --- Verify admin's view via the channel ---
    const adminMessages = await E(adminChannel).listMessages();
    t.is(adminMessages.length, 2, 'admin sees two messages');

    // Admin sees their own message
    t.is(await getAuthor(adminChannel, adminMessages[0]), 'AdminAlice');
    t.deepEqual(adminMessages[0].strings, ['Welcome to the channel!']);

    // Admin sees Bob's message with Bob's proposed name
    t.is(await getAuthor(adminChannel, adminMessages[1]), 'BobJoiner');
    t.deepEqual(adminMessages[1].strings, ['HELLO!']);
    t.deepEqual(
      await getPedigree(adminChannel, adminMessages[1]),
      ['AdminAlice'],
      'Bob was invited by AdminAlice',
    );

    // --- Verify Bob's view via the member ref ---
    // Bob's member ref sees the same shared message log
    const bobMessages = await E(bobMember).listMessages();
    t.is(bobMessages.length, 2, 'Bob sees two messages');

    // Bob sees admin's message with admin's proposed name
    t.is(await getAuthor(bobMember, bobMessages[0]), 'AdminAlice');
    t.deepEqual(bobMessages[0].strings, ['Welcome to the channel!']);

    // Bob sees his own message with his proposed name
    t.is(await getAuthor(bobMember, bobMessages[1]), 'BobJoiner');
    t.deepEqual(bobMessages[1].strings, ['HELLO!']);
  },
);

test.serial('channel - join creates a member with own identity', async t => {
  const { host } = await prepareHost(t);

  await E(host).makeChannel('my-channel', 'Alice');
  const channel = await E(host).lookup('my-channel');

  // Alice posts as admin
  await E(channel).post(['Hello from admin'], [], []);

  // Bob joins the channel (requires a prior createInvitation)
  await E(channel).createInvitation('Bob');
  const bobMember = await E(channel).join('Bob');
  t.truthy(bobMember, 'join should return a member reference');

  // Bob posts via his member ref
  await E(bobMember).post(['HELLO!'], [], []);

  // Verify messages
  const messages = await E(channel).listMessages();
  t.is(messages.length, 2);
  t.is(
    await getAuthor(channel, messages[0]),
    'Alice',
    'first message from admin',
  );
  t.is(
    await getAuthor(channel, messages[1]),
    'Bob',
    'second message from Bob, not Alice',
  );
  t.deepEqual(
    await getPedigree(channel, messages[1]),
    ['Alice'],
    'pedigree shows channel creator',
  );
});

test.serial(
  'channel - join via shared formula ID: persona posts with own identity',
  async t => {
    const { host } = await prepareHost(t);

    // --- Admin persona creates a channel ---
    const adminAgentName = 'persona-for-admin';
    await E(host).provideHost('admin-space', { agentName: adminAgentName });
    const adminPowers = await E(host).lookup(adminAgentName);

    await E(adminPowers).makeChannel('channel', 'AdminAlice');
    const adminChannel = await E(adminPowers).lookup('channel');
    await E(adminChannel).post(['Welcome to the channel!'], [], []);

    // --- Bob's persona receives the channel formula ID ---
    const bobAgentName = 'persona-for-bob';
    await E(host).provideHost('bob-space', { agentName: bobAgentName });
    const bobPowers = await E(host).lookup(bobAgentName);

    // Write the channel formula ID into Bob's pet store
    // (simulates the "Connect to Channel" locator flow)
    const channelId = await E(host).identify(adminAgentName, 'channel');
    await E(bobPowers).write('channel', channelId);

    // Bob looks up the channel
    const bobChannel = await E(bobPowers).lookup('channel');

    // Bob calls join() with his own display name to get a member ref
    await E(adminChannel).createInvitation('BobJoiner');
    const bobMember = await E(bobChannel).join('BobJoiner');
    await E(bobMember).post(['HELLO!'], [], []);

    // --- Verify admin's perspective ---
    const adminMessages = await E(adminChannel).listMessages();
    t.is(adminMessages.length, 2, 'admin sees two messages');
    t.is(await getAuthor(adminChannel, adminMessages[0]), 'AdminAlice');
    t.deepEqual(adminMessages[0].strings, ['Welcome to the channel!']);
    // Admin sees Bob's message as "BobJoiner" — a proposed name, not a pet name
    t.is(await getAuthor(adminChannel, adminMessages[1]), 'BobJoiner');
    t.deepEqual(adminMessages[1].strings, ['HELLO!']);
    t.deepEqual(await getPedigree(adminChannel, adminMessages[1]), [
      'AdminAlice',
    ]);

    // --- Verify Bob's perspective ---
    const bobMessages = await E(bobMember).listMessages();
    t.is(bobMessages.length, 2, 'Bob sees two messages');
    // Bob sees admin's message as "AdminAlice" — a proposed name (in scare quotes
    // in the UI), because Bob's address book is empty and doesn't know this person
    t.is(await getAuthor(bobMember, bobMessages[0]), 'AdminAlice');
    t.deepEqual(bobMessages[0].strings, ['Welcome to the channel!']);
    // Bob sees his own message with his own proposed name
    t.is(await getAuthor(bobMember, bobMessages[1]), 'BobJoiner');
    t.deepEqual(bobMessages[1].strings, ['HELLO!']);

    // --- Verify namespace independence ---
    // Bob's persona has its own pet store — it does NOT contain 'AdminAlice'
    // as a resolved name. The names in messages are proposed names, not pet names.
    const bobPetNames = await E(bobPowers).list();
    t.false(
      bobPetNames.includes('AdminAlice'),
      "Bob's namespace should not contain the admin's proposed name",
    );
    // Bob's pet store only has 'channel' (which he wrote)
    t.true(
      bobPetNames.includes('channel'),
      "Bob's namespace should contain the channel he connected to",
    );
  },
);

test.serial(
  'channel - joined member has independent follow stream',
  async t => {
    const { host } = await prepareHost(t);

    await E(host).makeChannel('my-channel', 'Alice');
    const channel = await E(host).lookup('my-channel');

    // Bob joins and starts following
    await E(channel).createInvitation('Bob');
    const bobMember = await E(channel).join('Bob');
    const bobIteratorRef = await E(bobMember).followMessages();
    const bobIterator = makeRefIterator(bobIteratorRef);

    // Alice posts after Bob starts following
    await E(channel).post(['Hello Bob!'], [], []);

    // Bob receives it
    const [msg] = await takeCount(bobIterator, 1);
    t.is(await getAuthor(bobMember, msg), 'Alice');
    t.deepEqual(msg.strings, ['Hello Bob!']);

    // Bob replies
    await E(bobMember).post(['Hi Alice!'], [], [], String(msg.number));

    // Bob sees his own reply
    const [reply] = await takeCount(bobIterator, 1);
    t.is(await getAuthor(bobMember, reply), 'Bob');
    t.deepEqual(reply.strings, ['Hi Alice!']);
    t.is(reply.replyTo, String(msg.number), 'reply points to Alice message');
  },
);

test.serial(
  'channel - proposed name is the channel creator display name',
  async t => {
    const { host } = await prepareHost(t);

    await E(host).makeChannel('my-channel', 'AliceDisplay');
    const channel = await E(host).lookup('my-channel');

    const proposedName = await E(channel).getProposedName();
    t.is(proposedName, 'AliceDisplay');
  },
);

test.serial('channel - message numbers increment correctly', async t => {
  const { host } = await prepareHost(t);

  await E(host).makeChannel('my-channel', 'Alice');
  const channel = await E(host).lookup('my-channel');

  await E(channel).post(['msg 0'], [], []);
  await E(channel).post(['msg 1'], [], []);
  await E(channel).post(['msg 2'], [], []);

  const messages = await E(channel).listMessages();
  t.is(messages.length, 3);
  t.is(messages[0].number, 0n);
  t.is(messages[1].number, 1n);
  t.is(messages[2].number, 2n);
});

test.serial(
  'channel - multiple followers receive the same new message',
  async t => {
    const { host } = await prepareHost(t);

    await E(host).makeChannel('my-channel', 'Alice');
    const channel = await E(host).lookup('my-channel');

    const [bobInvite] = await E(channel).createInvitation('Bob');
    const bobMember = await E(bobInvite).join('Bob');

    // Both admin and Bob start following
    const adminIteratorRef = await E(channel).followMessages();
    const adminIterator = makeRefIterator(adminIteratorRef);
    const bobIteratorRef = await E(bobMember).followMessages();
    const bobIterator = makeRefIterator(bobIteratorRef);

    // Bob posts
    await E(bobMember).post(['shared message'], [], []);

    // Both should receive it
    const [adminMsg] = await takeCount(adminIterator, 1);
    const [bobMsg] = await takeCount(bobIterator, 1);

    t.is(await getAuthor(channel, adminMsg), 'Bob');
    t.deepEqual(adminMsg.strings, ['shared message']);
    t.is(await getAuthor(bobMember, bobMsg), 'Bob');
    t.deepEqual(bobMsg.strings, ['shared message']);
  },
);

// ---------- Address book / per-viewer naming ----------

test.serial(
  'channel - Alice invites Bob who renames himself Robert',
  async t => {
    const { host } = await prepareHost(t);

    // Alice creates a channel called "friends", nicknames herself "Alice"
    await E(host).makeChannel('friends', 'Alice');
    const channel = await E(host).lookup('friends');

    // Alice invites her friend, naming the invitation "Bob"
    const [bobInvite] = await E(channel).createInvitation('Bob');
    const bobMember = await E(bobInvite).join('Bob');

    // Bob receives the proxy member ref, calls himself "Robert"
    await E(bobMember).setProposedName('Robert');

    // Verify Bob's proposed name was updated
    const bobName = await E(bobMember).getProposedName();
    t.is(bobName, 'Robert', 'Bob should now be known as Robert');

    // Bob says "hi"
    await E(bobMember).post(['hi'], [], []);

    const messages = await E(channel).listMessages();
    t.is(messages.length, 1);

    // The message author is "Robert" — what Bob calls himself
    t.is(
      await getAuthor(channel, messages[0]),
      'Robert',
      'message author should be the poster self-chosen name',
    );

    // The message carries a stable memberId so each viewer can resolve
    // the author name through their own address book
    t.truthy(messages[0].memberId, 'message should have a memberId');

    // The members list still knows this member was originally invited as "Bob"
    const members = await E(channel).getMembers();
    const bobEntry = members.find(m => m.memberId === messages[0].memberId);
    t.truthy(bobEntry, 'should find the member by memberId');
    t.is(bobEntry.proposedName, 'Robert', 'current display name is Robert');
    t.is(bobEntry.invitedAs, 'Bob', 'originally invited as Bob');
  },
);

test.serial('channel - per-viewer name resolution with memberId', async t => {
  const { host } = await prepareHost(t);

  // Alice creates a channel and names herself "Alice"
  await E(host).makeChannel('friends', 'Alice');
  const channel = await E(host).lookup('friends');

  // Alice invites "Bob"
  const [bobInvite] = await E(channel).createInvitation('Bob');
  const bobMember = await E(bobInvite).join('Bob');

  // Bob calls himself "Robert"
  await E(bobMember).setProposedName('Robert');

  // Bob says "hi"
  await E(bobMember).post(['hi'], [], []);

  // Alice says "Hi also"
  await E(channel).post(['Hi also'], [], []);

  const messages = await E(channel).listMessages();
  t.is(messages.length, 2);

  // --- Message 0: Bob's "hi" ---
  const bobMsg = messages[0];
  t.is(await getAuthor(channel, bobMsg), 'Robert', 'Bob posted as "Robert"');
  t.truthy(bobMsg.memberId, 'Bob message has memberId');

  // --- Message 1: Alice's "Hi also" ---
  const aliceMsg = messages[1];
  t.is(await getAuthor(channel, aliceMsg), 'Alice', 'Alice posted as "Alice"');
  t.truthy(aliceMsg.memberId, 'Alice message has memberId');

  // Alice and Bob have different memberIds
  t.not(
    bobMsg.memberId,
    aliceMsg.memberId,
    'each member has a unique memberId',
  );

  // --- Alice's perspective ---
  // Alice sees Bob's message. She looks up Bob's memberId in her address book.
  // She invited this memberId as "Bob", so her address book maps:
  //   bobMsg.memberId -> "Bob"
  // Result: Alice sees "Bob hi" (not "Robert hi")
  const membersFromAlice = await E(channel).getMembers();
  const bobInAliceView = membersFromAlice.find(
    m => m.memberId === bobMsg.memberId,
  );
  t.is(
    bobInAliceView.invitedAs,
    'Bob',
    'Alice can resolve Bob by the name she gave the invitation',
  );

  // --- Bob's perspective ---
  // Bob sees Alice's message. He looks up Alice's memberId in his address book.
  // Bob has NO entry for Alice — his address book is empty.
  // Result: Bob sees '"Alice" Hi also' (proposed name in scare quotes)
  // The proposed name "Alice" is available via getAuthor(channel, aliceMsg).
  t.is(
    await getAuthor(channel, aliceMsg),
    'Alice',
    'Alice proposed name available for Bob to show in scare quotes',
  );

  // Bob sees his own message. He looks up his own memberId.
  // His address book maps his own memberId -> "Robert" (his chosen name).
  // Result: Bob sees "Robert hi"
  t.is(
    await getAuthor(channel, bobMsg),
    'Robert',
    'Bob sees his own posts under his chosen name',
  );

  // --- Bob nicknames Alice "Al" ---
  // This is a client-side address book operation:
  //   bobAddressBook.set(aliceMsg.memberId, "Al")
  // After this, Bob sees "Al Hi also" instead of '"Alice" Hi also'.
  // Alice's view is unaffected because her address book is separate.
  // The memberId is stable, so the nickname survives across messages.
  t.is(aliceMsg.memberId, '0', 'admin memberId is stable so nicknames persist');
});

test.serial(
  'channel - setProposedName changes live name, memberId stays stable',
  async t => {
    const { host } = await prepareHost(t);

    await E(host).makeChannel('my-channel', 'Alice');
    const channel = await E(host).lookup('my-channel');

    const [bobInvite] = await E(channel).createInvitation('Bob');
    const bobMember = await E(bobInvite).join('Bob');

    // Bob posts as "Bob" initially
    await E(bobMember).post(['first post'], [], []);

    // Bob renames himself
    await E(bobMember).setProposedName('Robert');

    // Bob posts again
    await E(bobMember).post(['second post'], [], []);

    const messages = await E(channel).listMessages();
    t.is(messages.length, 2);

    // Both messages have the same memberId — the identity is stable
    t.is(
      messages[0].memberId,
      messages[1].memberId,
      'memberId stays the same across name changes',
    );

    // getMember() returns the current (latest) proposed name for both
    t.is(
      await getAuthor(channel, messages[0]),
      'Robert',
      'getMember resolves to current name, not snapshot at post time',
    );
    t.is(await getAuthor(channel, messages[1]), 'Robert');

    // But invitedAs preserves the original invitation name
    const info = await E(channel).getMember(messages[0].memberId);
    t.is(info.invitedAs, 'Bob', 'invitedAs preserves original name');
  },
);

test.serial(
  'channel - admin memberId is 0, members get incrementing ids',
  async t => {
    const { host } = await prepareHost(t);

    await E(host).makeChannel('my-channel', 'Alice');
    const channel = await E(host).lookup('my-channel');

    await E(channel).post(['admin msg'], [], []);

    const [bobInvite] = await E(channel).createInvitation('Bob');
    const bob = await E(bobInvite).join('Bob');
    await E(bob).post(['bob msg'], [], []);

    await E(channel).createInvitation('Carol');
    const carol = await E(channel).join('Carol');
    await E(carol).post(['carol msg'], [], []);

    const messages = await E(channel).listMessages();
    t.is(messages[0].memberId, '0', 'admin is member 0');
    t.is(messages[1].memberId, '1', 'first invited member is 1');
    t.is(messages[2].memberId, '2', 'second member is 2');
  },
);

// ---------- Multi-channel persona ----------

test.serial(
  'channel - persona with multiple channels posts independently',
  async t => {
    const { host } = await prepareHost(t);

    // Create a persona host
    const agentName = 'persona-multi';
    await E(host).provideHost('multi-space', { agentName });
    const personaPowers = await E(host).lookup(agentName);

    // Create two channels inside the persona
    await E(personaPowers).makeChannel('channel-a', 'Alice');
    await E(personaPowers).makeChannel('channel-b', 'Alice');

    const channelA = await E(personaPowers).lookup('channel-a');
    const channelB = await E(personaPowers).lookup('channel-b');

    // Post to each independently
    await E(channelA).post(['Hello from A'], [], []);
    await E(channelB).post(['Hello from B'], [], []);
    await E(channelA).post(['Second A message'], [], []);

    // Verify messages are isolated per channel
    const messagesA = await E(channelA).listMessages();
    t.is(messagesA.length, 2, 'channel-a should have 2 messages');
    t.deepEqual(messagesA[0].strings, ['Hello from A']);
    t.deepEqual(messagesA[1].strings, ['Second A message']);

    const messagesB = await E(channelB).listMessages();
    t.is(messagesB.length, 1, 'channel-b should have 1 message');
    t.deepEqual(messagesB[0].strings, ['Hello from B']);
  },
);

test.serial(
  'channel - two personas join same channel independently',
  async t => {
    const { host } = await prepareHost(t);

    // Admin creates a channel
    const adminAgentName = 'persona-admin';
    await E(host).provideHost('admin-space', { agentName: adminAgentName });
    const adminPowers = await E(host).lookup(adminAgentName);
    await E(adminPowers).makeChannel('channel', 'AdminAlice');
    const adminChannel = await E(adminPowers).lookup('channel');

    // Persona A creates a host, writes channel formula ID, joins as "Alice"
    const aliceAgentName = 'persona-alice';
    await E(host).provideHost('alice-space', { agentName: aliceAgentName });
    const alicePowers = await E(host).lookup(aliceAgentName);

    const channelId = await E(host).identify(adminAgentName, 'channel');
    await E(alicePowers).write('channel', channelId);
    const aliceChannel = await E(alicePowers).lookup('channel');
    await E(adminChannel).createInvitation('Alice');
    const aliceMember = await E(aliceChannel).join('Alice');

    // Persona B creates a separate host, writes same formula ID, joins as "Bob"
    const bobAgentName = 'persona-bob';
    await E(host).provideHost('bob-space', { agentName: bobAgentName });
    const bobPowers = await E(host).lookup(bobAgentName);

    await E(bobPowers).write('channel', channelId);
    const bobChannel = await E(bobPowers).lookup('channel');
    await E(adminChannel).createInvitation('Bob');
    const bobMember = await E(bobChannel).join('Bob');

    // Alice posts, Bob posts
    await E(aliceMember).post(['Hello from Alice'], [], []);
    await E(bobMember).post(['Hello from Bob'], [], []);

    // Verify both see all messages
    const adminMessages = await E(adminChannel).listMessages();
    t.is(adminMessages.length, 2, 'admin sees both messages');
    t.is(await getAuthor(adminChannel, adminMessages[0]), 'Alice');
    t.is(await getAuthor(adminChannel, adminMessages[1]), 'Bob');

    // Verify Alice and Bob have different memberIds
    t.not(
      adminMessages[0].memberId,
      adminMessages[1].memberId,
      'Alice and Bob have different memberIds',
    );

    // Verify each persona's pet store is independent
    const alicePets = await E(alicePowers).list();
    const bobPets = await E(bobPowers).list();
    t.true(alicePets.includes('channel'), 'Alice has channel in her store');
    t.true(bobPets.includes('channel'), 'Bob has channel in his store');
    t.false(alicePets.includes('Bob'), 'Alice does not have Bob in her store');
    t.false(bobPets.includes('Alice'), 'Bob does not have Alice in his store');
  },
);

test.serial('channel - channel enumeration within a persona', async t => {
  const { host } = await prepareHost(t);

  // Create persona host, create 3 channels
  const agentName = 'persona-enum';
  await E(host).provideHost('enum-space', { agentName });
  /** @type {ERef<EndoHost>} */
  const personaPowers = await E(host).lookup(agentName);

  await E(personaPowers).makeChannel('general', 'Alice');
  await E(personaPowers).makeChannel('random', 'Alice');
  await E(personaPowers).makeChannel('help', 'Alice');

  // Enumerate pet names
  const petNames = await E(personaPowers).list();
  t.true(petNames.includes('general'), 'should contain general');
  t.true(petNames.includes('random'), 'should contain random');
  t.true(petNames.includes('help'), 'should contain help');

  // Use locate to identify channel-type items
  const channelNames = [];
  for (const name of petNames) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const locator = await E(personaPowers).locate(name);
      if (locator) {
        const locatorUrl = new URL(locator);
        const type = locatorUrl.searchParams.get('type');
        if (type === 'channel') {
          channelNames.push(name);
        }
      }
    } catch {
      // Some items may not be locatable
    }
  }

  t.true(channelNames.includes('general'), 'general is a channel type');
  t.true(channelNames.includes('random'), 'random is a channel type');
  t.true(channelNames.includes('help'), 'help is a channel type');
});

// ---------- getMembers scoping ----------

test.serial(
  'channel - admin getMembers returns only members admin directly invited',
  async t => {
    const { host } = await prepareHost(t);

    await E(host).makeChannel('room', 'Alice');
    const channel = await E(host).lookup('room');

    // Admin invites Bob and Carol
    const [bobInvite] = await E(channel).createInvitation('Bob');
    const bobMember = await E(bobInvite).join('Bob');
    await E(channel).createInvitation('Carol');

    // Bob sub-invites Dave
    await E(bobMember).createInvitation('Dave');

    // Admin's getMembers should return ONLY Bob and Carol (directly invited),
    // not Dave (invited by Bob) and not Alice herself.
    const adminMembers = await E(channel).getMembers();
    const adminMemberNames = adminMembers.map(m => m.proposedName);

    t.deepEqual(
      adminMemberNames.sort(),
      ['Bob', 'Carol'],
      'admin sees only directly invited members',
    );

    // Admin entry should NOT appear in the list
    t.false(
      adminMemberNames.includes('Alice'),
      'admin self-entry is not included',
    );

    // Dave should NOT appear (sub-invited by Bob, not admin)
    t.false(
      adminMemberNames.includes('Dave'),
      'sub-invitee Dave is not visible to admin',
    );
  },
);

test.serial(
  'channel - member getMembers returns only members they directly invited',
  async t => {
    const { host } = await prepareHost(t);

    await E(host).makeChannel('room', 'Alice');
    const channel = await E(host).lookup('room');

    // Admin invites Bob
    const [bobInvite] = await E(channel).createInvitation('Bob');
    const bobMember = await E(bobInvite).join('Bob');

    // Admin invites Carol
    await E(channel).createInvitation('Carol');

    // Bob sub-invites Dave and Eve
    await E(bobMember).createInvitation('Dave');
    await E(bobMember).createInvitation('Eve');

    // Bob's getMembers should return ONLY Dave and Eve (his invitees)
    const bobMembers = await E(bobMember).getMembers();
    const bobMemberNames = bobMembers.map(m => m.proposedName);

    t.deepEqual(
      bobMemberNames.sort(),
      ['Dave', 'Eve'],
      'Bob sees only his own invitees',
    );

    // Bob should NOT see Carol (invited by admin, not Bob)
    t.false(bobMemberNames.includes('Carol'), 'Carol is not visible to Bob');

    // Bob should NOT see Alice (admin)
    t.false(bobMemberNames.includes('Alice'), 'admin is not visible to Bob');

    // Bob should NOT see himself
    t.false(bobMemberNames.includes('Bob'), 'Bob does not see himself');
  },
);

test.serial(
  'channel - member with no invitations sees empty getMembers',
  async t => {
    const { host } = await prepareHost(t);

    await E(host).makeChannel('room', 'Alice');
    const channel = await E(host).lookup('room');

    // Admin invites Bob and Carol
    const [bobInvite] = await E(channel).createInvitation('Bob');
    const bobMember = await E(bobInvite).join('Bob');
    await E(channel).createInvitation('Carol');

    // Bob has not invited anyone
    const bobMembers = await E(bobMember).getMembers();
    t.is(bobMembers.length, 0, 'Bob sees no members since he invited nobody');
  },
);

test.serial(
  'channel - join does not appear in admin getMembers (only invites do)',
  async t => {
    const { host } = await prepareHost(t);

    await E(host).makeChannel('room', 'Alice');
    const channel = await E(host).lookup('room');

    // Someone joins the channel (requires a prior createInvitation)
    await E(channel).createInvitation('Bob');
    const bob = await E(channel).join('Bob');
    t.truthy(bob, 'join returns a member ref');

    // Admin's getMembers only shows explicitly invited members, not join-created ones
    const members = await E(channel).getMembers();
    t.is(
      members.length,
      1,
      'createInvitation-created member appears in invitations list',
    );
  },
);

test.serial(
  'channel - each invitation creates exactly one entry in getMembers',
  async t => {
    const { host } = await prepareHost(t);

    await E(host).makeChannel('room', 'Alice');
    const channel = await E(host).lookup('room');

    // Admin creates 3 invitations
    await E(channel).createInvitation('Bob');
    await E(channel).createInvitation('Carol');
    await E(channel).createInvitation('Dave');

    const members = await E(channel).getMembers();
    t.is(members.length, 3, 'exactly 3 entries for 3 invitations');

    const names = members.map(m => m.proposedName);
    t.deepEqual(names.sort(), ['Bob', 'Carol', 'Dave']);
  },
);

// ---------- Auto-assignment of invitation names ----------

test.serial(
  'channel - getMembers provides data for auto-assigning invitation names',
  async t => {
    const { host } = await prepareHost(t);

    // Alice creates a channel
    await E(host).makeChannel('room', 'Alice');
    const channel = await E(host).lookup('room');

    // Alice invites "Bob" and "Carol"
    const [bobInvite] = await E(channel).createInvitation('Bob');
    const bobMember = await E(bobInvite).join('Bob');
    const [carolInvite] = await E(channel).createInvitation('Carol');
    const carolMember = await E(carolInvite).join('Carol');

    // Bob renames himself to "Robert" — his invitedAs should stay "Bob"
    await E(bobMember).setProposedName('Robert');

    // Bob and Carol post messages
    await E(bobMember).post(['hello from bob'], [], []);
    await E(carolMember).post(['hello from carol'], [], []);

    // Alice reads messages
    const messages = await E(channel).listMessages();
    t.is(messages.length, 2);

    // Alice gets the members list to resolve invitation names
    const members = await E(channel).getMembers();
    const ourName = await E(channel).getProposedName();
    t.is(ourName, 'Alice');

    // Build auto-assignment map: for members WE invited, use invitedAs
    const autoNames = new Map();
    for (const member of members) {
      // Skip self (admin has empty pedigree)
      if (member.pedigree.length !== 0) {
        // The last entry in pedigree is the direct inviter's name
        const directInviter = member.pedigree[member.pedigree.length - 1];
        if (directInviter === ourName) {
          autoNames.set(member.memberId, member.invitedAs);
        }
      }
    }

    // Alice invited both Bob and Carol, so both should be auto-assigned
    t.is(
      autoNames.get(messages[0].memberId),
      'Bob',
      'Bob auto-assigned as "Bob" (his invitedAs, not "Robert")',
    );
    t.is(
      autoNames.get(messages[1].memberId),
      'Carol',
      'Carol auto-assigned as "Carol"',
    );

    // --- Bob's perspective ---
    // Bob sees messages but did NOT invite anyone
    const bobMembers = await E(bobMember).getMembers();
    const bobName = await E(bobMember).getProposedName();
    t.is(bobName, 'Robert');

    const bobAutoNames = new Map();
    for (const member of bobMembers) {
      if (member.pedigree.length !== 0) {
        const directInviter = member.pedigree[member.pedigree.length - 1];
        if (directInviter === bobName) {
          bobAutoNames.set(member.memberId, member.invitedAs);
        }
      }
    }

    // Bob did NOT invite anyone, so no auto-assignments
    t.is(
      bobAutoNames.size,
      0,
      'Bob has no auto-assignments since he invited nobody',
    );
  },
);

test.serial('channel - sub-invitations auto-assign correctly', async t => {
  const { host } = await prepareHost(t);

  // Alice creates a channel
  await E(host).makeChannel('room', 'Alice');
  const channel = await E(host).lookup('room');

  // Alice invites Bob
  const [bobInvite] = await E(channel).createInvitation('Bob');
  const bobMember = await E(bobInvite).join('Bob');

  // Bob invites Carol (sub-invitation)
  const [carolInvite] = await E(bobMember).createInvitation('Carol');
  const carolMember = await E(carolInvite).join('Carol');

  // Carol posts
  await E(carolMember).post(['hi from carol'], [], []);

  // --- Alice's perspective ---
  const aliceMembers = await E(channel).getMembers();
  const aliceName = await E(channel).getProposedName();

  const aliceAutoNames = new Map();
  for (const member of aliceMembers) {
    if (member.pedigree.length !== 0) {
      const directInviter = member.pedigree[member.pedigree.length - 1];
      if (directInviter === aliceName) {
        aliceAutoNames.set(member.memberId, member.invitedAs);
      }
    }
  }

  // Alice invited Bob directly, but NOT Carol (Bob invited Carol)
  t.is(aliceAutoNames.size, 1, 'Alice only auto-assigns for Bob');
  t.true(aliceAutoNames.has('1'), 'Bob (memberId 1) is auto-assigned');
  t.is(aliceAutoNames.get('1'), 'Bob');

  // --- Bob's perspective ---
  const bobMembers = await E(bobMember).getMembers();
  const bobName = await E(bobMember).getProposedName();

  const bobAutoNames = new Map();
  for (const member of bobMembers) {
    if (member.pedigree.length !== 0) {
      const directInviter = member.pedigree[member.pedigree.length - 1];
      if (directInviter === bobName) {
        bobAutoNames.set(member.memberId, member.invitedAs);
      }
    }
  }

  // Bob invited Carol, so Carol should be auto-assigned
  t.is(bobAutoNames.size, 1, 'Bob auto-assigns for Carol');
  t.is(bobAutoNames.get('2'), 'Carol');
});

// ---------- UI flow simulation ----------
// These tests mirror exactly what the chat UI does when creating and
// navigating channel spaces, to verify that each space's agent is
// truly independent.

test.serial(
  'UI flow: handleNewChannelSubmit creates distinct agents per space',
  async t => {
    const { host } = await prepareHost(t);

    // === Space A: "New Channel" flow (mirrors handleNewChannelSubmit) ===
    const spaceNameA = 'general';
    const agentNameA = `persona-for-${spaceNameA}`;
    const displayNameA = 'Alice';

    // Step 1: Create persona (host)
    await E(host).provideHost(spaceNameA, { agentName: agentNameA });

    // Step 2: Get the persona's powers (what the UI navigates into)
    const personaPowersA = await E(host).lookup(agentNameA);

    // Step 3: Create channel inside persona's store (named 'general' per UI convention)
    await E(personaPowersA).makeChannel('general', displayNameA);

    // === Space B: "New Channel" flow (different space name) ===
    const spaceNameB = 'random';
    const agentNameB = `persona-for-${spaceNameB}`;
    const displayNameB = 'Bob';

    await E(host).provideHost(spaceNameB, { agentName: agentNameB });
    const personaPowersB = await E(host).lookup(agentNameB);
    await E(personaPowersB).makeChannel('general', displayNameB);

    // === Verify agents are DISTINCT ===
    const agentIdA = await E(host).identify(agentNameA);
    const agentIdB = await E(host).identify(agentNameB);
    t.not(
      agentIdA,
      agentIdB,
      'Space A and Space B must have different agent IDs',
    );

    // === Verify pet stores are independent ===
    const petNamesA = await E(personaPowersA).list();
    const petNamesB = await E(personaPowersB).list();

    // Both should have 'general' (created by makeChannel)
    t.true(petNamesA.includes('general'), 'Space A has general');
    t.true(petNamesB.includes('general'), 'Space B has general');

    // But the channels should be DIFFERENT formulas
    const channelIdA = await E(personaPowersA).identify('general');
    const channelIdB = await E(personaPowersB).identify('general');
    t.not(
      channelIdA,
      channelIdB,
      'Space A and Space B channels are different formulas',
    );

    // === Verify messages are isolated ===
    const channelA = await E(personaPowersA).lookup('general');
    const channelB = await E(personaPowersB).lookup('general');

    await E(channelA).post(['Hello from Alice in Space A'], [], []);
    await E(channelB).post(['Hello from Bob in Space B'], [], []);

    const messagesA = await E(channelA).listMessages();
    const messagesB = await E(channelB).listMessages();

    t.is(messagesA.length, 1, 'Space A sees only its own message');
    t.is(messagesB.length, 1, 'Space B sees only its own message');
    t.deepEqual(messagesA[0].strings, ['Hello from Alice in Space A']);
    t.deepEqual(messagesB[0].strings, ['Hello from Bob in Space B']);
    t.is(await getAuthor(channelA, messagesA[0]), displayNameA);
    t.is(await getAuthor(channelB, messagesB[0]), displayNameB);
  },
);

test.serial(
  'UI flow: handleConnectChannelSubmit creates new agent that joins existing channel',
  async t => {
    const { host } = await prepareHost(t);

    // === Admin Space: create channel ===
    const adminSpaceName = 'admin-room';
    const adminAgentName = `persona-for-${adminSpaceName}`;
    const adminDisplayName = 'AdminAlice';

    await E(host).provideHost(adminSpaceName, { agentName: adminAgentName });
    const adminPowers = await E(host).lookup(adminAgentName);
    await E(adminPowers).makeChannel('general', adminDisplayName);
    const adminChannel = await E(adminPowers).lookup('general');

    // Admin posts a welcome message
    await E(adminChannel).post(['Welcome to the room!'], [], []);

    // === Joiner Space: connect to the same channel ===
    // (mirrors handleConnectChannelSubmit with connectPersonaMode === 'new')
    const joinerSpaceName = 'join-room';
    const joinerAgentName = `persona-for-${joinerSpaceName}`;
    const joinerDisplayName = 'BobJoiner';

    // Step 1: Create new persona for the joiner
    await E(host).provideHost(joinerSpaceName, { agentName: joinerAgentName });
    const joinerPowers = await E(host).lookup(joinerAgentName);

    // Step 2: Get the channel's formula ID (what the locator encodes)
    const channelFormulaId = await E(host).identify(adminAgentName, 'general');

    // Step 3: Write channel formula ID into joiner's pet store
    await E(joinerPowers).write('general', channelFormulaId);

    // === Simulate what bodyComponent does when navigating to the joiner space ===
    // resolvePowers: E(rootPowers).lookup(joinerAgentName) → joinerPowers
    // then: E(joinerPowers).lookup('general') → the shared channel ref
    const joinerChannelRef = await E(joinerPowers).lookup('general');

    // Check if we're admin or joiner by comparing proposed names
    const channelCreatorName = await E(joinerChannelRef).getProposedName();
    t.is(channelCreatorName, adminDisplayName, 'channel creator is AdminAlice');
    t.not(
      joinerDisplayName,
      channelCreatorName,
      'joiner display name differs from creator',
    );

    // Since we're not the admin, create invitation then join to get our own member ref
    await E(adminChannel).createInvitation(joinerDisplayName);
    const joinerMemberRef = await E(joinerChannelRef).join(joinerDisplayName);

    // Post as the joiner
    await E(joinerMemberRef).post(['Hello from Bob!'], [], []);

    // === Verify both see all messages ===
    const adminMessages = await E(adminChannel).listMessages();
    t.is(adminMessages.length, 2, 'admin sees both messages');
    t.is(await getAuthor(adminChannel, adminMessages[0]), adminDisplayName);
    t.is(await getAuthor(adminChannel, adminMessages[1]), joinerDisplayName);

    const joinerMessages = await E(joinerMemberRef).listMessages();
    t.is(joinerMessages.length, 2, 'joiner sees both messages');

    // === Verify pet store isolation ===
    const adminPetNames = await E(adminPowers).list();
    const joinerPetNames = await E(joinerPowers).list();

    // Admin's pet store should NOT contain joiner-specific names
    t.false(
      adminPetNames.includes(joinerDisplayName),
      'admin store does not have joiner display name',
    );
    // Joiner's pet store should NOT contain admin-specific names
    t.false(
      joinerPetNames.includes(adminDisplayName),
      'joiner store does not have admin display name',
    );

    // Both have 'general' but they point to the SAME formula (shared channel)
    const adminChannelId = await E(adminPowers).identify('general');
    const joinerChannelId = await E(joinerPowers).identify('general');
    t.is(
      adminChannelId,
      joinerChannelId,
      'both stores reference the same channel formula',
    );

    // === Verify agent independence ===
    const adminAgentId = await E(host).identify(adminAgentName);
    const joinerAgentId = await E(host).identify(joinerAgentName);
    t.not(
      adminAgentId,
      joinerAgentId,
      'admin and joiner have different agent IDs',
    );
  },
);

test.serial(
  'UI flow: provideHost is idempotent — same space name returns same agent',
  async t => {
    const { host } = await prepareHost(t);

    const spaceName = 'my-space';
    const agentName = `persona-for-${spaceName}`;

    // First call: creates the agent
    await E(host).provideHost(spaceName, { agentName });
    const powersFirst = await E(host).lookup(agentName);
    const agentIdFirst = await E(host).identify(agentName);

    // Create a channel inside the agent
    await E(powersFirst).makeChannel('general', 'Alice');

    // Second call with same spaceName: should return SAME agent (not create new)
    await E(host).provideHost(spaceName, { agentName });
    const powersSecond = await E(host).lookup(agentName);
    const agentIdSecond = await E(host).identify(agentName);

    t.is(agentIdFirst, agentIdSecond, 'provideHost is idempotent on same name');

    // The channel from the first call should still be there
    const channel = await E(powersSecond).lookup('general');
    const messages = await E(channel).listMessages();
    t.is(messages.length, 0, 'channel exists and has no messages');

    // This proves: if someone deletes a space from the gutter and recreates
    // it with the same name, they get the SAME agent (with all its old data).
    // This is intentional "provide" semantics, but users may find it surprising.
  },
);

// ---------- Space deletion cleanup ----------

test.serial(
  'deleting handle and agent pet names ensures provideHost creates fresh agent',
  async t => {
    const { host } = await prepareHost(t);

    // === Step 1: Create a channel space (mirrors add-space-modal handleNewChannelSubmit) ===
    const spaceName = 'general';
    const agentName = `persona-for-${spaceName}`;
    const displayName = 'Alice';

    await E(host).provideHost(spaceName, { agentName });
    const personaPowers = await E(host).lookup(agentName);
    await E(personaPowers).makeChannel('general', displayName);

    // Create extra channels inside the agent
    await E(personaPowers).makeChannel('random', displayName);
    await E(personaPowers).makeChannel('help', displayName);

    // Post a message to prove it has data
    const channel = await E(personaPowers).lookup('general');
    await E(channel).post(['Hello from Alice'], [], []);

    // Verify channels exist
    const petsBeforeDelete = await E(personaPowers).list();
    t.true(
      petsBeforeDelete.includes('general'),
      'general exists before delete',
    );
    t.true(petsBeforeDelete.includes('random'), 'random exists before delete');
    t.true(petsBeforeDelete.includes('help'), 'help exists before delete');

    const agentIdBefore = await E(host).identify(agentName);

    // === Step 2: Delete the space (mirrors complete removeSpace) ===
    // Remove the handle pet name (first arg to provideHost)
    await E(host).remove(spaceName);
    // Remove the agent pet name
    await E(host).remove(agentName);

    // === Step 3: Recreate with the same name ===
    await E(host).provideHost(spaceName, { agentName });
    const newPowers = await E(host).lookup(agentName);
    const agentIdAfter = await E(host).identify(agentName);

    // The new agent should be a DIFFERENT formula (fresh)
    t.not(
      agentIdBefore,
      agentIdAfter,
      'after deleting handle + agent, provideHost creates a new agent',
    );

    // The new agent should have no user-created channels
    const petsAfterDelete = await E(newPowers).list();
    t.false(
      petsAfterDelete.includes('general'),
      'old "general" channel should not exist in fresh agent',
    );
    t.false(
      petsAfterDelete.includes('random'),
      'old "random" channel should not exist in fresh agent',
    );
    t.false(
      petsAfterDelete.includes('help'),
      'old "help" channel should not exist in fresh agent',
    );
  },
);

test.serial(
  'fresh agent after delete-recreate has no address book state from old agent',
  async t => {
    const { host } = await prepareHost(t);

    // Simulates the full delete-recreate cycle that the UI performs.
    // The daemon must produce a completely independent agent with its own
    // pet store.  The browser side must also clear localStorage (tested in
    // the E2E suite), but the daemon must not leak any state either.

    const spaceName = 'general';
    const agentName = `persona-for-${spaceName}`;

    // === Create first space, invite a member, post messages ===
    await E(host).provideHost(spaceName, { agentName });
    const powers1 = await E(host).lookup(agentName);
    await E(powers1).makeChannel('general', 'Alice');
    const channel1 = await E(powers1).lookup('general');

    // Alice invites Bob
    const [bobInvite] = await E(channel1).createInvitation('Bob');
    const bobMember = await E(bobInvite).join('Bob');
    await E(bobMember).post(['hello from bob'], [], []);

    // Alice sees Bob in getMembers (only directly invited members)
    const members1 = await E(channel1).getMembers();
    t.is(members1.length, 1, 'original channel has one invitee (Bob)');

    const petStore1Id = await E(host).identify(agentName);

    // === Delete the space (handle + agent) ===
    await E(host).remove(spaceName);
    await E(host).remove(agentName);

    // === Recreate with the same name ===
    await E(host).provideHost(spaceName, { agentName });
    const powers2 = await E(host).lookup(agentName);
    const petStore2Id = await E(host).identify(agentName);

    // Must be a different agent
    t.not(petStore1Id, petStore2Id, 'new agent has different formula ID');

    // New agent starts with no user channels
    const pets2 = await E(powers2).list();
    t.false(pets2.includes('general'), 'no "general" channel in fresh agent');

    // Create a new channel with the same name
    await E(powers2).makeChannel('general', 'Alice');
    const channel2 = await E(powers2).lookup('general');

    // The new channel should have no invitations
    const members2 = await E(channel2).getMembers();
    t.is(members2.length, 0, 'fresh channel has no invitations');

    // No messages in the new channel
    const messages2 = await E(channel2).listMessages();
    t.is(messages2.length, 0, 'fresh channel has no messages');
  },
);

test.serial(
  'deleting ONLY the space config (without handle/agent) causes stale data on recreate',
  async t => {
    const { host } = await prepareHost(t);

    // This test documents the BUG: if removeSpace only removes the
    // space config, provideHost returns the old agent with old channels.

    const spaceName = 'general';
    const agentName = `persona-for-${spaceName}`;

    await E(host).provideHost(spaceName, { agentName });
    const personaPowers = await E(host).lookup(agentName);
    await E(personaPowers).makeChannel('general', 'Alice');

    const channel = await E(personaPowers).lookup('general');
    await E(channel).post(['Old message'], [], []);

    const agentIdBefore = await E(host).identify(agentName);

    // Simulate the OLD broken removeSpace: only remove space config,
    // NOT the handle or agent.
    // (In practice, this removes from ['spaces', id] — we skip that here
    // since we're testing the root pet store behavior.)

    // === Recreate WITHOUT cleaning up handle/agent ===
    await E(host).provideHost(spaceName, { agentName });
    const sameAgentId = await E(host).identify(agentName);

    // BUG: Same agent, same channels, same messages
    t.is(
      agentIdBefore,
      sameAgentId,
      'BUG: provideHost returns the same agent because handle still exists',
    );

    const samePowers = await E(host).lookup(agentName);
    const pets = await E(samePowers).list();
    t.true(pets.includes('general'), 'BUG: old channel is still present');

    const oldChannel = await E(samePowers).lookup('general');
    const messages = await E(oldChannel).listMessages();
    t.is(messages.length, 1, 'BUG: old messages are still there');
    t.deepEqual(messages[0].strings, ['Old message']);
  },
);

// ===== join() idempotency =====

test.serial(
  'join() is idempotent - returns same member on repeated calls',
  async t => {
    const { host } = await prepareHost(t);
    await E(host).makeChannel('idem-chan', 'Admin');
    const channel = await E(host).lookup('idem-chan');

    // Join twice with the same name
    await E(channel).createInvitation('Alice');
    const member1 = await E(channel).join('Alice');
    const member2 = await E(channel).join('Alice');

    // Should be the exact same object
    t.is(member1, member2, 'join() returns the same member on repeated calls');

    // Both should have the same memberId
    const id1 = await E(member1).getMemberId();
    const id2 = await E(member2).getMemberId();
    t.is(id1, id2, 'same memberId from both references');
  },
);

test.serial(
  'join() idempotency - messages use stable memberId across visits',
  async t => {
    const { host } = await prepareHost(t);
    await E(host).makeChannel('stable-chan', 'Admin');
    const channel = await E(host).lookup('stable-chan');

    // Simulate first visit: join and post
    await E(channel).createInvitation('Bob');
    const member1 = await E(channel).join('Bob');
    await E(member1).post(['Hello from visit 1'], [], []);

    // Simulate second visit: join again and post
    const member2 = await E(channel).join('Bob');
    await E(member2).post(['Hello from visit 2'], [], []);

    // Both messages should have the same memberId
    const messages = await E(channel).listMessages();
    t.is(messages.length, 2);
    t.is(
      messages[0].memberId,
      messages[1].memberId,
      'messages from repeated join() calls have the same memberId',
    );
  },
);

test.serial(
  'join() with different names creates different members',
  async t => {
    const { host } = await prepareHost(t);
    await E(host).makeChannel('diff-chan', 'Admin');
    const channel = await E(host).lookup('diff-chan');

    await E(channel).createInvitation('Alice');
    const alice = await E(channel).join('Alice');
    await E(channel).createInvitation('Bob');
    const bob = await E(channel).join('Bob');

    t.not(alice, bob, 'different names create different members');

    const aliceId = await E(alice).getMemberId();
    const bobId = await E(bob).getMemberId();
    t.not(aliceId, bobId, 'different members have different memberIds');
  },
);

// ===== getMemberId() =====

test.serial('getMemberId() returns admin ID for channel', async t => {
  const { host } = await prepareHost(t);
  await E(host).makeChannel('mid-chan', 'Admin');
  const channel = await E(host).lookup('mid-chan');

  const adminId = await E(channel).getMemberId();
  t.is(adminId, '0', 'channel admin memberId is "0"');
});

test.serial('getMemberId() returns stable ID for member', async t => {
  const { host } = await prepareHost(t);
  await E(host).makeChannel('mid2-chan', 'Admin');
  const channel = await E(host).lookup('mid2-chan');

  await E(channel).createInvitation('Alice');
  const member = await E(channel).join('Alice');
  const memberId = await E(member).getMemberId();
  t.is(typeof memberId, 'string', 'memberId is a string');
  t.not(memberId, '0', 'member ID is different from admin ID');

  // Post a message and verify the memberId matches
  await E(member).post(['Test message'], [], []);
  const messages = await E(channel).listMessages();
  t.is(
    messages[0].memberId,
    memberId,
    'message memberId matches getMemberId() result',
  );
});

test.serial('getMemberId() is consistent across multiple calls', async t => {
  const { host } = await prepareHost(t);
  await E(host).makeChannel('mid3-chan', 'Admin');
  const channel = await E(host).lookup('mid3-chan');

  await E(channel).createInvitation('Alice');
  const member = await E(channel).join('Alice');
  const id1 = await E(member).getMemberId();
  const id2 = await E(member).getMemberId();
  t.is(id1, id2, 'getMemberId() returns consistent results');
});

// ===== getMembers excludes join-created members =====

test.serial(
  'getMembers excludes join-created members from invitations list',
  async t => {
    const { host } = await prepareHost(t);
    await E(host).makeChannel('dup-chan', 'Alice');
    const channel = await E(host).lookup('dup-chan');

    // Admin invites Bob explicitly
    await E(channel).createInvitation('Bob');

    // Bob also joins (as would happen when Bob connects via the UI)
    await E(channel).join('Bob');

    // Admin's getMembers should show only the invite-created entry, not the join-created one
    const members = await E(channel).getMembers();
    t.is(
      members.length,
      1,
      'only one entry for Bob (the invitation, not the join)',
    );
    t.is(members[0].proposedName, 'Bob');
  },
);

test.serial(
  'getMembers shows only invite-created members even with multiple joiners',
  async t => {
    const { host } = await prepareHost(t);
    await E(host).makeChannel('multi-join-chan', 'Alice');
    const channel = await E(host).lookup('multi-join-chan');

    // Admin invites Bob and Carol
    await E(channel).createInvitation('Bob');
    await E(channel).createInvitation('Carol');

    // Bob and Carol both join (UI connect flow)
    await E(channel).join('Bob');
    await E(channel).join('Carol');

    // A third person "Dave" joins without being invited
    await E(channel).createInvitation('Dave');
    await E(channel).join('Dave');

    // Admin should see all 3 explicit invitations
    const members = await E(channel).getMembers();
    t.is(members.length, 3, 'Bob, Carol, and Dave all from createInvitation()');
    const names = members.map(m => m.proposedName).sort();
    t.deepEqual(names, ['Bob', 'Carol', 'Dave']);
  },
);

test.serial('join-only member does not appear in admin getMembers', async t => {
  const { host } = await prepareHost(t);
  await E(host).makeChannel('join-only-chan', 'Alice');
  const channel = await E(host).lookup('join-only-chan');

  // Someone joins after being invited
  await E(channel).createInvitation('Eve');
  await E(channel).join('Eve');

  // Admin should see the invitation
  const members = await E(channel).getMembers();
  t.is(
    members.length,
    1,
    'createInvitation-created member listed in invitations',
  );
});

// ---------- Attenuator updates getMembers() ----------

test.serial(
  'channel - attenuator causes getMembers() to show active: false',
  async t => {
    const { host } = await prepareHost(t);
    await E(host).makeChannel('my-channel', 'Alice');
    const channel = await E(host).lookup('my-channel');

    const [bobInvite, bobAttenuator] = await E(channel).createInvitation('Bob');
    const bobProxy = await E(bobInvite).join('Bob');
    await E(bobProxy).post(['Hello before disabling'], [], []);

    // Before disabling, Bob should be active
    let members = await E(channel).getMembers();
    let bob = members.find(m => m.proposedName === 'Bob');
    t.is(bob?.active, true, 'Bob should be active before disabling');

    // Disable via the attenuator object
    await E(bobAttenuator).setInvitationValidity(false);

    // After disabling, Bob should be inactive in getMembers()
    members = await E(channel).getMembers();
    bob = members.find(m => m.proposedName === 'Bob');
    t.is(
      bob?.active,
      false,
      'Bob should be inactive after setInvitationValidity(false)',
    );
  },
);

// ---------- Re-enabling via attenuator ----------

test.serial(
  'channel - re-enabling via setInvitationValidity(true)',
  async t => {
    const { host } = await prepareHost(t);
    await E(host).makeChannel('my-channel', 'Alice');
    const channel = await E(host).lookup('my-channel');

    const [bobInvite, bobAttenuator] = await E(channel).createInvitation('Bob');
    const bobProxy = await E(bobInvite).join('Bob');

    // Disable then re-enable
    await E(bobAttenuator).setInvitationValidity(false);
    await t.throwsAsync(() => E(bobProxy).post(['Should fail'], [], []), {
      message: /disabled/,
    });

    await E(bobAttenuator).setInvitationValidity(true);
    // Should work again
    await E(bobProxy).post(['Back online'], [], []);
    const messages = await E(channel).listMessages();
    t.is(messages.length, 1);
    t.deepEqual(messages[0].strings, ['Back online']);
  },
);

// ---------- Heat-based rate limiting ----------

test.serial(
  'channel - heat config: burst limit blocks rapid posts',
  async t => {
    const { host } = await prepareHost(t);
    await E(host).makeChannel('my-channel', 'Alice');
    const channel = await E(host).lookup('my-channel');

    const [bobInvite, bobAttenuator] = await E(channel).createInvitation('Bob');
    const bobProxy = await E(bobInvite).join('Bob');

    // Burst of 3 with minimal cooling. heatPerMessage = 90/3 = 30.
    // coolRate = 30 * (1/60) = 0.5/s. CapTP round-trips take ~200-500ms
    // so cooling between messages is negligible. We send 4 messages to
    // ensure the threshold is exceeded even with some cooling.
    await E(bobAttenuator).setHeatConfig({
      burstLimit: 3,
      sustainedRate: 1,
      lockoutDurationMs: 60000,
      postLockoutPct: 0,
    });

    // First 3 posts should succeed (heat accumulates to ~90 minus small cooling)
    await E(bobProxy).post(['Post 1'], [], []);
    await E(bobProxy).post(['Post 2'], [], []);
    await E(bobProxy).post(['Post 3'], [], []);

    // Fourth post must trigger lockout (heat well over 90)
    await t.throwsAsync(
      () => E(bobProxy).post(['Post 4'], [], []),
      { message: /Rate limit lockout/ },
      'exceeding burst limit should trigger heat lockout',
    );
  },
);

// ---------- Temporary ban ----------

test.serial('channel - temporary ban blocks access', async t => {
  const { host } = await prepareHost(t);
  await E(host).makeChannel('my-channel', 'Alice');
  const channel = await E(host).lookup('my-channel');

  const [bobInvite, bobAttenuator] = await E(channel).createInvitation('Bob');
  const bobProxy = await E(bobInvite).join('Bob');

  // Ban for a long time (won't expire during test)
  await E(bobAttenuator).temporaryBan(3600);

  await t.throwsAsync(
    () => E(bobProxy).post(['Should fail'], [], []),
    { message: /temporarily banned/ },
    'temporarily banned member should not be able to post',
  );
});

// ---------- getAttenuator reconstruction ----------

test.serial('channel - getAttenuator returns a working attenuator', async t => {
  const { host } = await prepareHost(t);
  await E(host).makeChannel('my-channel', 'Alice');
  const channel = await E(host).lookup('my-channel');

  const [bobInvite] = await E(channel).createInvitation('Bob');
  const bobProxy = await E(bobInvite).join('Bob');

  // Get attenuator by name
  const attenuator = await E(channel).getAttenuator('Bob');
  t.truthy(attenuator, 'getAttenuator should return an attenuator');

  // Use it to disable Bob
  await E(attenuator).setInvitationValidity(false);

  await t.throwsAsync(
    () => E(bobProxy).post(['Should fail'], [], []),
    { message: /disabled/ },
    'attenuator from getAttenuator should work',
  );
});

// ---------- Unique invitation name enforcement ----------

test.serial('channel - duplicate invitation names are rejected', async t => {
  const { host } = await prepareHost(t);
  await E(host).makeChannel('my-channel', 'Alice');
  const channel = await E(host).lookup('my-channel');

  await E(channel).createInvitation('Bob');

  // Second createInvitation with same name should fail
  await t.throwsAsync(
    () => E(channel).createInvitation('Bob'),
    { message: /already exists/ },
    'duplicate invitation names should be rejected',
  );
});

// ---------- Cascading heat config ----------

test.serial('channel - cascading heat config from parent', async t => {
  const { host } = await prepareHost(t);
  await E(host).makeChannel('my-channel', 'Alice');
  const channel = await E(host).lookup('my-channel');

  const [bobInvite, bobAttenuator] = await E(channel).createInvitation('Bob');
  const bobProxy = await E(bobInvite).join('Bob');

  // Bob invites Carol
  const [carolInvite] = await E(bobProxy).createInvitation('Carol');
  const carolProxy = await E(carolInvite).join('Carol');

  // Set heat config on Bob — should cascade to Carol.
  // Send 4 messages to guarantee exceeding threshold despite CapTP latency cooling.
  await E(bobAttenuator).setHeatConfig({
    burstLimit: 3,
    sustainedRate: 1,
    lockoutDurationMs: 60000,
    postLockoutPct: 0,
  });

  // Carol's first 3 posts should succeed
  await E(carolProxy).post(['First'], [], []);
  await E(carolProxy).post(['Second'], [], []);
  await E(carolProxy).post(['Third'], [], []);

  // Carol's fourth post triggers lockout (cascading from Bob's heat config)
  await t.throwsAsync(
    () => E(carolProxy).post(['Fourth'], [], []),
    { message: /Rate limit lockout/ },
    'heat config should cascade from parent',
  );
});

// ---------- Attenuator affects join-created members ----------

test.serial(
  'channel - disabling invite blocks join-created member',
  async t => {
    const { host } = await prepareHost(t);
    await E(host).makeChannel('my-channel', 'Alice');
    const channel = await E(host).lookup('my-channel');

    // Alice invites Bob (creates the invite entry + attenuator)
    await E(channel).createInvitation('Bob');

    // Bob connects to the channel and joins
    const bobMember = await E(channel).join('Bob');
    await E(bobMember).post(['Hello from joined Bob'], [], []);

    // Alice disables Bob via the attenuator (targets the invite entry)
    const attenuator = await E(channel).getAttenuator('Bob');
    await E(attenuator).setInvitationValidity(false);

    // Bob's join-created member should also be blocked
    await t.throwsAsync(
      () => E(bobMember).post(['Should fail'], [], []),
      { message: /disabled/ },
      'disabling invite should block join-created member with same name',
    );

    // Bob should also not be able to follow messages
    await t.throwsAsync(
      () => E(bobMember).followMessages(),
      { message: /disabled/ },
      'disabling invite should block join-created member followMessages',
    );
  },
);

test.serial(
  'channel - re-enabling invite unblocks join-created member',
  async t => {
    const { host } = await prepareHost(t);
    await E(host).makeChannel('my-channel', 'Alice');
    const channel = await E(host).lookup('my-channel');

    await E(channel).createInvitation('Bob');
    const bobMember = await E(channel).join('Bob');

    const attenuator = await E(channel).getAttenuator('Bob');

    // Disable then re-enable
    await E(attenuator).setInvitationValidity(false);
    await t.throwsAsync(() => E(bobMember).post(['Should fail'], [], []), {
      message: /disabled/,
    });

    await E(attenuator).setInvitationValidity(true);
    await E(bobMember).post(['Back online'], [], []);
    const messages = await E(channel).listMessages();
    t.is(messages.length, 1);
    t.deepEqual(messages[0].strings, ['Back online']);
  },
);

test.serial(
  'channel - disabling invite stops existing follow stream for join-created member',
  async t => {
    const { host } = await prepareHost(t);
    await E(host).makeChannel('my-channel', 'Alice');
    const channel = await E(host).lookup('my-channel');

    await E(channel).createInvitation('Bob');
    const bobMember = await E(channel).join('Bob');

    // Bob starts following BEFORE being disabled
    const bobIteratorRef = await E(bobMember).followMessages();
    const bobIterator = makeRefIterator(bobIteratorRef);

    // Alice posts — Bob sees it
    await E(channel).post(['Before disable'], [], []);
    const msg1 = await bobIterator.next();
    t.is(msg1.value.strings[0], 'Before disable');

    // Alice disables Bob's invite
    const attenuator = await E(channel).getAttenuator('Bob');
    await E(attenuator).setInvitationValidity(false);

    // Alice posts again
    await E(channel).post(['After disable'], [], []);

    // Bob's existing iterator should throw on next()
    await t.throwsAsync(
      () => bobIterator.next(),
      { message: /disabled/ },
      'existing follow stream should stop after invite is disabled',
    );
  },
);

test.serial(
  'channel - disabled invite: message posted AFTER disable not seen by waiting join iterator',
  async t => {
    const { host } = await prepareHost(t);
    await E(host).makeChannel('my-channel', 'Alice');
    const channel = await E(host).lookup('my-channel');

    // Alice invites Bob, Bob joins
    await E(channel).createInvitation('Bob');
    const bobMember = await E(channel).join('Bob');

    // Bob starts following and reads the existing (empty) backlog
    const bobIteratorRef = await E(bobMember).followMessages();
    const bobIterator = makeRefIterator(bobIteratorRef);

    // Alice posts — Bob sees it
    await E(channel).post(['Visible'], [], []);
    const msg1 = await bobIterator.next();
    t.is(msg1.value.strings[0], 'Visible');

    // Bob calls next() — it will BLOCK waiting for the next message.
    // While it's blocking, Alice disables Bob, then posts.
    const nextPromise = bobIterator.next();

    // Alice disables Bob's invitation
    const attenuator = await E(channel).getAttenuator('Bob');
    await E(attenuator).setInvitationValidity(false);

    // Alice posts a new message — Bob should NOT receive this
    await E(channel).post(['Should NOT be visible'], [], []);

    // Bob's waiting next() should reject, not resolve with the message
    await t.throwsAsync(
      () => nextPromise,
      { message: /disabled/ },
      'message posted after disable must not be delivered to a waiting iterator',
    );
  },
);

test.serial(
  'channel - disabled invite: message posted AFTER disable not seen by waiting proxy iterator',
  async t => {
    const { host } = await prepareHost(t);
    await E(host).makeChannel('my-channel', 'Alice');
    const channel = await E(host).lookup('my-channel');

    // Alice invites Bob — Bob uses the proxy directly
    const [bobInvite] = await E(channel).createInvitation('Bob');
    const bobProxy = await E(bobInvite).join('Bob');

    // Bob starts following via the proxy
    const bobIteratorRef = await E(bobProxy).followMessages();
    const bobIterator = makeRefIterator(bobIteratorRef);

    // Alice posts — Bob sees it
    await E(channel).post(['Visible'], [], []);
    const msg1 = await bobIterator.next();
    t.is(msg1.value.strings[0], 'Visible');

    // Bob calls next() — blocks waiting for next message
    const nextPromise = bobIterator.next();

    // Alice disables Bob via getAttenuator
    const attenuator = await E(channel).getAttenuator('Bob');
    await E(attenuator).setInvitationValidity(false);

    // Alice posts — Bob should NOT receive this
    await E(channel).post(['Should NOT be visible'], [], []);

    // Bob's waiting next() should reject
    await t.throwsAsync(
      () => nextPromise,
      { message: /disabled/ },
      'message posted after disable must not be delivered to a waiting proxy iterator',
    );
  },
);

test.serial(
  'channel - temporary ban on invite blocks join-created member',
  async t => {
    const { host } = await prepareHost(t);
    await E(host).makeChannel('my-channel', 'Alice');
    const channel = await E(host).lookup('my-channel');

    await E(channel).createInvitation('Bob');
    const bobMember = await E(channel).join('Bob');

    const attenuator = await E(channel).getAttenuator('Bob');
    await E(attenuator).temporaryBan(3600);

    await t.throwsAsync(
      () => E(bobMember).post(['Should fail'], [], []),
      { message: /temporarily banned/ },
      'temporary ban on invite should block join-created member',
    );
  },
);

// ---------- Cascading disable: disabling parent disables grandchild ----------

test.serial(
  'channel - disabling Bob cascades to Carol invited by Bob (via join)',
  async t => {
    const { host } = await prepareHost(t);
    await E(host).makeChannel('my-channel', 'Alice');
    const channel = await E(host).lookup('my-channel');

    // Alice invites Bob
    await E(channel).createInvitation('Bob');

    // Bob joins (like the real app does via gateway)
    const bobMember = await E(channel).join('Bob');

    // Bob invites Carol using his join-created member
    const [carolInvite] = await E(bobMember).createInvitation('Carol');
    const carolProxy = await E(carolInvite).join('Carol');

    // Carol can post initially
    await E(carolProxy).post(['Hello from Carol'], [], []);

    // Alice disables Bob
    const bobAttenuator = await E(channel).getAttenuator('Bob');
    await E(bobAttenuator).setInvitationValidity(false);

    // Carol should now be blocked (cascading from Bob's disable)
    await t.throwsAsync(
      () => E(carolProxy).post(['Should fail'], [], []),
      { message: /disabled/ },
      'disabling Bob should cascade to Carol who was invited by join-created Bob',
    );
  },
);

test.serial(
  'channel - disabling Bob cascades to Carol invited by Bob (via proxy)',
  async t => {
    const { host } = await prepareHost(t);
    await E(host).makeChannel('my-channel', 'Alice');
    const channel = await E(host).lookup('my-channel');

    // Alice invites Bob, gets proxy
    const [bobInvite, bobAttenuator] = await E(channel).createInvitation('Bob');
    const bobProxy = await E(bobInvite).join('Bob');

    // Bob invites Carol using his proxy
    const [carolInvite] = await E(bobProxy).createInvitation('Carol');
    const carolProxy = await E(carolInvite).join('Carol');

    // Carol can post initially
    await E(carolProxy).post(['Hello from Carol'], [], []);

    // Alice disables Bob
    await E(bobAttenuator).setInvitationValidity(false);

    // Carol should now be blocked (cascading from Bob's disable)
    await t.throwsAsync(
      () => E(carolProxy).post(['Should fail'], [], []),
      { message: /disabled/ },
      'disabling Bob should cascade to Carol who was invited by Bob proxy',
    );
  },
);

test.serial(
  'channel - re-enabling Bob re-enables Carol (cascading)',
  async t => {
    const { host } = await prepareHost(t);
    await E(host).makeChannel('my-channel', 'Alice');
    const channel = await E(host).lookup('my-channel');

    await E(channel).createInvitation('Bob');
    const bobMember = await E(channel).join('Bob');
    const [carolInvite] = await E(bobMember).createInvitation('Carol');
    const carolProxy = await E(carolInvite).join('Carol');

    // Disable Bob → Carol blocked
    const bobAttenuator = await E(channel).getAttenuator('Bob');
    await E(bobAttenuator).setInvitationValidity(false);
    await t.throwsAsync(() => E(carolProxy).post(['Should fail'], [], []), {
      message: /disabled/,
    });

    // Re-enable Bob → Carol should work again
    await E(bobAttenuator).setInvitationValidity(true);
    await E(carolProxy).post(['Carol is back'], [], []);
    t.pass('Carol can post after Bob is re-enabled');
  },
);

// ---------- Heat config: getHeatConfig ----------

test.serial(
  'channel - getHeatConfig returns null when no config set',
  async t => {
    const { host } = await prepareHost(t);
    await E(host).makeChannel('my-channel', 'Alice');
    const channel = await E(host).lookup('my-channel');

    // Admin always returns null
    const adminConfig = await E(channel).getHeatConfig();
    t.is(adminConfig, null, 'admin getHeatConfig returns null');

    const [bobInvite] = await E(channel).createInvitation('Bob');
    const bobProxy = await E(bobInvite).join('Bob');

    // Member with no config returns null
    const bobConfig = await E(bobProxy).getHeatConfig();
    t.is(
      bobConfig,
      null,
      'member getHeatConfig returns null before config is set',
    );
  },
);

test.serial('channel - getHeatConfig returns set config', async t => {
  const { host } = await prepareHost(t);
  await E(host).makeChannel('my-channel', 'Alice');
  const channel = await E(host).lookup('my-channel');

  const [bobInvite, bobAttenuator] = await E(channel).createInvitation('Bob');
  const bobProxy = await E(bobInvite).join('Bob');

  const config = {
    burstLimit: 10,
    sustainedRate: 30,
    lockoutDurationMs: 10000,
    postLockoutPct: 40,
  };
  await E(bobAttenuator).setHeatConfig(config);

  // Attenuator getHeatConfig
  const attConfig = await E(bobAttenuator).getHeatConfig();
  t.deepEqual(attConfig, config, 'attenuator getHeatConfig returns set config');

  // Member getHeatConfig
  const memberConfig = await E(bobProxy).getHeatConfig();
  t.deepEqual(memberConfig, config, 'member getHeatConfig returns set config');
});

test.serial(
  'channel - heat config: posts within sustained rate succeed',
  async t => {
    const { host } = await prepareHost(t);
    await E(host).makeChannel('my-channel', 'Alice');
    const channel = await E(host).lookup('my-channel');

    const [bobInvite, bobAttenuator] = await E(channel).createInvitation('Bob');
    const bobProxy = await E(bobInvite).join('Bob');

    // Generous burst limit — no lockout expected
    await E(bobAttenuator).setHeatConfig({
      burstLimit: 30,
      sustainedRate: 60,
      lockoutDurationMs: 5000,
      postLockoutPct: 40,
    });

    // Send several messages — all should succeed with burst of 30
    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await E(bobProxy).post([`Post ${i}`], [], []);
    }

    const messages = await E(channel).listMessages();
    t.is(
      messages.length,
      5,
      'all 5 posts succeeded within generous burst limit',
    );
  },
);

// ---------- Composite heat: getHopInfo and followHeatEvents ----------

test.serial(
  'channel - getHopInfo returns chain of policies and states',
  async t => {
    const { host } = await prepareHost(t);

    await E(host).makeChannel('hop-chan', 'Admin');
    const channel = await E(host).lookup('hop-chan');

    // Create admin → A → B chain
    const [inviteA, attA] = await E(channel).createInvitation('A');
    await E(attA).setHeatConfig({
      burstLimit: 10,
      sustainedRate: 20,
      lockoutDurationMs: 5000,
      postLockoutPct: 30,
    });
    const memberA = await E(inviteA).join('A');

    const [inviteB, attB] = await E(memberA).createInvitation('B');
    await E(attB).setHeatConfig({
      burstLimit: 5,
      sustainedRate: 10,
      lockoutDurationMs: 3000,
      postLockoutPct: 20,
    });
    const memberB = await E(inviteB).join('B');

    // B's getHopInfo should return 2 hops (A and B, both with heat configs)
    const hopInfo = await E(memberB).getHopInfo();
    t.is(hopInfo.policies.length, 2, 'B sees 2 hops (A and B)');
    t.is(hopInfo.states.length, 2, 'B has 2 state entries');

    // First hop is A (root-first order)
    t.is(hopInfo.policies[0].label, 'A');
    t.is(hopInfo.policies[0].burstLimit, 10);
    t.is(hopInfo.policies[0].hopIndex, 0);

    // Second hop is B
    t.is(hopInfo.policies[1].label, 'B');
    t.is(hopInfo.policies[1].burstLimit, 5);
    t.is(hopInfo.policies[1].hopIndex, 1);

    // States should both show 0 heat initially
    t.is(hopInfo.states[0].heat, 0);
    t.is(hopInfo.states[1].heat, 0);
    t.is(hopInfo.states[0].locked, false);
    t.is(hopInfo.states[1].locked, false);
  },
);

test.serial('channel - getHopInfo omits hops without heatConfig', async t => {
  const { host } = await prepareHost(t);

  await E(host).makeChannel('hop-no-cfg', 'Admin');
  const channel = await E(host).lookup('hop-no-cfg');

  // admin → A (no config) → B (has config)
  const [inviteA] = await E(channel).createInvitation('A');
  const memberA = await E(inviteA).join('A');

  const [inviteB, attB] = await E(memberA).createInvitation('B');
  await E(attB).setHeatConfig({
    burstLimit: 5,
    sustainedRate: 10,
    lockoutDurationMs: 3000,
    postLockoutPct: 20,
  });
  const memberB = await E(inviteB).join('B');

  const hopInfo = await E(memberB).getHopInfo();
  t.is(hopInfo.policies.length, 1, 'only hop with config is included');
  t.is(hopInfo.policies[0].label, 'B');
});

test.serial('channel - admin getHopInfo returns empty', async t => {
  const { host } = await prepareHost(t);

  await E(host).makeChannel('hop-admin', 'Admin');
  const channel = await E(host).lookup('hop-admin');

  const hopInfo = await E(channel).getHopInfo();
  t.is(hopInfo.policies.length, 0, 'admin has no hops');
  t.is(hopInfo.states.length, 0, 'admin has no state');
});

test.serial(
  'channel - followHeatEvents delivers events for ancestor hops',
  async t => {
    const { host } = await prepareHost(t);

    await E(host).makeChannel('heat-evt', 'Admin');
    const channel = await E(host).lookup('heat-evt');

    // Create admin → A with heat config
    const [inviteA, attA] = await E(channel).createInvitation('A');
    await E(attA).setHeatConfig({
      burstLimit: 10,
      sustainedRate: 20,
      lockoutDurationMs: 5000,
      postLockoutPct: 30,
    });
    const memberA = await E(inviteA).join('A');

    // Create A → B with heat config
    const [inviteB, attB] = await E(memberA).createInvitation('B');
    await E(attB).setHeatConfig({
      burstLimit: 5,
      sustainedRate: 10,
      lockoutDurationMs: 3000,
      postLockoutPct: 20,
    });
    const memberB = await E(inviteB).join('B');

    // Subscribe B to heat events
    const eventsRef = await E(memberB).followHeatEvents();
    const eventIter = makeRefIterator(eventsRef);

    // B posts — this should generate heat events for both A's and B's pools
    await E(memberB).post(['hello'], [], []);

    // We should get heat events for both hops (A and B)
    const event1 = await eventIter.next();
    t.truthy(event1.value, 'first heat event received');
    t.is(event1.value.type, 'heat');

    const event2 = await eventIter.next();
    t.truthy(event2.value, 'second heat event received');
    t.is(event2.value.type, 'heat');

    // The two events should be for different hops
    t.not(
      event1.value.hopMemberId,
      event2.value.hopMemberId,
      'events are for different hops',
    );
  },
);

// ---------- Downstream policy isolation ----------

test.serial(
  'channel - downstream tight limit does not inflate parent heat',
  async t => {
    const { host } = await prepareHost(t);
    await E(host).makeChannel('iso-chan', 'Alice');
    const channel = await E(host).lookup('iso-chan');

    // Alice → Bob with generous burst limit (10 messages)
    const [bobInvite, bobAtt] = await E(channel).createInvitation('Bob');
    await E(bobAtt).setHeatConfig({
      burstLimit: 10,
      sustainedRate: 1,
      lockoutDurationMs: 60000,
      postLockoutPct: 0,
    });
    const bobMember = await E(bobInvite).join('Bob');

    // Bob → Carol with tight burst limit (3 messages)
    const [carolInvite, carolAtt] =
      await E(bobMember).createInvitation('Carol');
    await E(carolAtt).setHeatConfig({
      burstLimit: 3,
      sustainedRate: 1,
      lockoutDurationMs: 60000,
      postLockoutPct: 0,
    });
    const carolMember = await E(carolInvite).join('Carol');

    // Carol posts 3 messages — hits Carol's own limit
    await E(carolMember).post(['C1'], [], []);
    await E(carolMember).post(['C2'], [], []);
    await E(carolMember).post(['C3'], [], []);

    // Carol's 4th post should fail (Carol's burstLimit=3 is exhausted)
    await t.throwsAsync(
      () => E(carolMember).post(['C4'], [], []),
      { message: /Rate limit lockout/ },
      'Carol hits her own tight limit after 3 posts',
    );

    // Bob's hop should have gained heat at Bob's rate (9 per msg = 27 total),
    // NOT at Carol's rate (30 per msg = 90 total). So Bob should still be
    // able to post comfortably.
    await E(bobMember).post(['B1'], [], []);
    await E(bobMember).post(['B2'], [], []);
    await E(bobMember).post(['B3'], [], []);
    await E(bobMember).post(['B4'], [], []);
    // Bob has now posted 4 messages = 36 heat on his own, plus Carol's 3
    // added 27 = 63 total. Still below 90 threshold.
    t.pass('Bob can still post after Carol exhausted her own limit');
  },
);

test.serial(
  'channel - getHopInfo returns each hop policy independently',
  async t => {
    const { host } = await prepareHost(t);
    await E(host).makeChannel('iso-hop', 'Alice');
    const channel = await E(host).lookup('iso-hop');

    // Alice → Bob (generous)
    const [bobInvite, bobAtt] = await E(channel).createInvitation('Bob');
    await E(bobAtt).setHeatConfig({
      burstLimit: 10,
      sustainedRate: 20,
      lockoutDurationMs: 5000,
      postLockoutPct: 30,
    });
    const bobMember = await E(bobInvite).join('Bob');

    // Bob → Carol (tight)
    const [carolInvite, carolAtt] =
      await E(bobMember).createInvitation('Carol');
    await E(carolAtt).setHeatConfig({
      burstLimit: 3,
      sustainedRate: 5,
      lockoutDurationMs: 10000,
      postLockoutPct: 10,
    });
    const carolMember = await E(carolInvite).join('Carol');

    const hopInfo = await E(carolMember).getHopInfo();
    t.is(hopInfo.policies.length, 2, 'Carol sees 2 hops');

    // First hop = Bob's policy (generous)
    t.is(hopInfo.policies[0].burstLimit, 10, 'Bob hop has burstLimit 10');
    t.is(hopInfo.policies[0].sustainedRate, 20, 'Bob hop has sustainedRate 20');

    // Second hop = Carol's policy (tight)
    t.is(hopInfo.policies[1].burstLimit, 3, 'Carol hop has burstLimit 3');
    t.is(hopInfo.policies[1].sustainedRate, 5, 'Carol hop has sustainedRate 5');

    // The policies must be independent — Carol's tight limit should not
    // appear on Bob's hop entry
    t.not(
      hopInfo.policies[0].burstLimit,
      hopInfo.policies[1].burstLimit,
      'hop policies are distinct, not contaminated',
    );
  },
);

test.serial(
  'channel - parent heat accumulates at parent rate from child posts',
  async t => {
    const { host } = await prepareHost(t);
    await E(host).makeChannel('rate-chan', 'Alice');
    const channel = await E(host).lookup('rate-chan');

    // Alice → Bob with burstLimit 10 (heatPerMessage = 9)
    const [bobInvite, bobAtt] = await E(channel).createInvitation('Bob');
    await E(bobAtt).setHeatConfig({
      burstLimit: 10,
      sustainedRate: 1,
      lockoutDurationMs: 60000,
      postLockoutPct: 0,
    });
    const bobMember = await E(bobInvite).join('Bob');

    // Bob → Carol with burstLimit 3 (heatPerMessage = 30)
    const [carolInvite, carolAtt] =
      await E(bobMember).createInvitation('Carol');
    await E(carolAtt).setHeatConfig({
      burstLimit: 3,
      sustainedRate: 1,
      lockoutDurationMs: 60000,
      postLockoutPct: 0,
    });
    const carolMember = await E(carolInvite).join('Carol');

    // Carol posts 2 messages
    await E(carolMember).post(['C1'], [], []);
    await E(carolMember).post(['C2'], [], []);

    // Check Bob's hop heat via getHopInfo.
    // Bob's rate: heatPerMessage = 90/10 = 9, so 2 posts = ~18 heat.
    // If bug exists (using Carol's rate): 90/3 = 30, so 2 posts = ~60 heat.
    const hopInfo = await E(carolMember).getHopInfo();
    const bobState = hopInfo.states[0]; // Bob is first (root-first)

    // Allow some tolerance for cooling during CapTP roundtrips
    t.true(
      // eslint-disable-next-line @endo/restrict-comparison-operands
      bobState.heat < 30,
      `Bob hop heat should be ~18 (at Bob's rate), got ${bobState.heat}`,
    );
    t.false(
      bobState.locked,
      'Bob hop should not be locked after only 2 child posts',
    );
  },
);

// ---------- Unified message format tests ----------

test.serial('channel messages have type:"package" field', async t => {
  const { host } = await prepareHost(t);
  await E(host).makeChannel('my-channel', 'Alice');
  const channel = await E(host).lookup('my-channel');

  await E(channel).post(['Hello'], [], []);
  const messages = await E(channel).listMessages();
  t.is(messages[0].type, 'package', 'message should have type "package"');
});

test.serial('channel messages use "names" not "edgeNames"', async t => {
  const { host } = await prepareHost(t);
  await E(host).makeChannel('my-channel', 'Alice');
  const channel = await E(host).lookup('my-channel');

  await E(channel).post(['Hello ', ''], ['attachment'], []);
  const messages = await E(channel).listMessages();
  t.deepEqual(
    messages[0].names,
    ['attachment'],
    'message should have names field',
  );
  t.is(
    /** @type {any} */ (messages[0]).edgeNames,
    undefined,
    'message should NOT have edgeNames',
  );
});

test.serial('channel messages have a messageId', async t => {
  const { host } = await prepareHost(t);
  await E(host).makeChannel('my-channel', 'Alice');
  const channel = await E(host).lookup('my-channel');

  await E(channel).post(['Hello'], [], []);
  const messages = await E(channel).listMessages();
  t.is(typeof messages[0].messageId, 'string', 'messageId should be a string');
  t.true(messages[0].messageId.length !== 0, 'messageId should be non-empty');
});

test.serial(
  'channel messages do NOT carry author/pedigree/pedigreeMemberIds',
  async t => {
    const { host } = await prepareHost(t);
    await E(host).makeChannel('my-channel', 'Alice');
    const channel = await E(host).lookup('my-channel');

    const [bobInvite] = await E(channel).createInvitation('Bob');
    const bobMember = await E(bobInvite).join('Bob');
    await E(bobMember).post(['Hello'], [], []);

    const messages = await E(channel).listMessages();
    const msg = /** @type {any} */ (messages[0]);
    t.is(msg.author, undefined, 'message should NOT have author field');
    t.is(msg.pedigree, undefined, 'message should NOT have pedigree field');
    t.is(
      msg.pedigreeMemberIds,
      undefined,
      'message should NOT have pedigreeMemberIds field',
    );
  },
);

test.serial('getMember(memberId) returns member info', async t => {
  const { host } = await prepareHost(t);
  await E(host).makeChannel('my-channel', 'Alice');
  const channel = await E(host).lookup('my-channel');

  const [bobInvite] = await E(channel).createInvitation('Bob');
  const bobMember = await E(bobInvite).join('Bob');

  const bobMemberId = await E(bobMember).getMemberId();
  const info = await E(channel).getMember(bobMemberId);
  t.truthy(info, 'getMember should return info for a valid memberId');
  t.is(info.proposedName, 'Bob');
  t.is(info.invitedAs, 'Bob');
  t.is(info.memberId, bobMemberId);
  t.deepEqual(info.pedigree, ['Alice']);
  t.true(
    Array.isArray(info.pedigreeMemberIds),
    'pedigreeMemberIds should be an array',
  );

  // Admin member info
  const adminInfo = await E(channel).getMember('0');
  t.truthy(adminInfo, 'getMember should return info for admin');
  t.is(adminInfo.proposedName, 'Alice');
  t.deepEqual(adminInfo.pedigree, []);

  // Unknown memberId
  const unknown = await E(channel).getMember('999');
  t.is(
    unknown,
    undefined,
    'getMember should return undefined for unknown memberId',
  );
});
