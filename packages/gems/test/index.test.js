import test from '@endo/ses-ava/prepare-endo.js';
import { E } from '@endo/far';
import { util } from '../src/index.js';
import { makeScenario } from './util.js';
import { makeKumavisStore } from '../src/kumavis-store.js';

const { delay } = util;

test('lifecycle - ping/gc', async t => {
  const makeGem = {
    methodNames: ['ping'],
    makeFacet: async () => {
      return {
        async ping() {
          return 'pong';
        },
      };
    },
  };

  const { aliceKit, bobKit } = makeScenario({ makeBoth: makeGem });
  // bob's bootstrap is alice and vice versa
  const alice = await bobKit.captpKit.getBootstrap();

  console.log('ping ->');
  console.log('     <-', await E(alice).ping());
  console.log('ping ->');
  console.log('     <-', await E(alice).ping());
  await aliceKit.gem.wakeController.sleep();

  console.log('ping ->');
  console.log('     <-', await E(alice).ping());

  console.log('...attempting to trigger timebased GC...');
  await delay(10e3);

  console.log('ping ->');
  console.log('     <-', await E(alice).ping());

  // this is just an example
  t.pass();
});

test('persistence - simple json counter', async t => {
  const makeGem = {
    methodNames: ['increment', 'getCount'],
    makeFacet: async ({ persistenceNode }) => {
      const initState = { count: 0 };
      const store = await makeKumavisStore({ persistenceNode }, initState);
      return {
        async increment() {
          let { count } = store.get();
          count += 1;
          await store.update({ count });
          return count;
        },
        async getCount() {
          const { count } = store.get();
          return count;
        },
      };
    },
  };

  const { aliceKit, bobKit } = makeScenario({ makeBoth: makeGem });
  // bob's bootstrap is alice and vice versa
  const alice = await bobKit.captpKit.getBootstrap();

  t.deepEqual(await E(alice).getCount(), 0);
  await E(alice).increment();
  t.deepEqual(await E(alice).getCount(), 1);

  await aliceKit.gem.wakeController.sleep();

  t.deepEqual(await E(alice).getCount(), 1);
  await Promise.all([E(alice).increment(), E(alice).increment()]);
  t.deepEqual(await E(alice).getCount(), 3);
});

test('kumavis store - serialization + retention of gem refs', async t => {
  const makeGem = {
    methodNames: ['addFriend', 'getFriends'],
    makeFacet: async ({ persistenceNode, retentionSet, gemLookup }) => {
      const initState = { friends: [] };
      const store = await makeKumavisStore(
        { persistenceNode, retentionSet, gemLookup },
        initState,
      );
      return {
        async addFriend(friend) {
          const { friends } = store.get();
          friends.push(friend);
          await store.update({ friends });
          return `added friend ${friend} (${friends.length} friends total)`;
        },
        async getFriends() {
          const { friends } = store.get();
          return friends;
        },
      };
    },
  };

  const { aliceKit, bobKit } = makeScenario({ makeBoth: makeGem });
  // bob's bootstrap is alice and vice versa
  const alice = await bobKit.captpKit.getBootstrap();
  const bob = await aliceKit.captpKit.getBootstrap();

  t.deepEqual(aliceKit.gem.retentionSet.size, 0);
  await E(alice).addFriend(bob);
  t.deepEqual(aliceKit.gem.retentionSet.size, 1);
  await aliceKit.gem.wakeController.sleep();

  const aliceFriends = await E(alice).getFriends();
  t.deepEqual(aliceKit.gem.retentionSet.size, 1);
  t.deepEqual(aliceFriends, [bob]);
  t.notDeepEqual(aliceFriends, [alice]);
});

test('kumavis store - serialization of gem refs', async t => {
  const makeGem = {
    methodNames: ['addFriend', 'getFriends'],
    makeFacet: async ({ persistenceNode, retentionSet, gemLookup }) => {
      const initState = { friends: [] };
      const store = await makeKumavisStore(
        { persistenceNode, retentionSet, gemLookup },
        initState,
      );
      return {
        async addFriend(friend) {
          const { friends } = store.get();
          friends.push(friend);
          await store.update({ friends });
          return `added friend ${friend} (${friends.length} friends total)`;
        },
        async getFriends() {
          const { friends } = store.get();
          return friends;
        },
      };
    },
  };

  const { aliceKit, bobKit } = makeScenario({ makeBoth: makeGem });
  // bob's bootstrap is alice and vice versa
  const alice = await bobKit.captpKit.getBootstrap();
  const bob = await aliceKit.captpKit.getBootstrap();

  t.deepEqual(aliceKit.gem.retentionSet.size, 0);
  await E(alice).addFriend(bob);
  t.deepEqual(aliceKit.gem.retentionSet.size, 1);
  await aliceKit.gem.wakeController.sleep();

  const aliceFriends = await E(alice).getFriends();
  t.deepEqual(aliceKit.gem.retentionSet.size, 1);
  t.deepEqual(aliceFriends, [bob]);
  t.notDeepEqual(aliceFriends, [alice]);
});

test('makeGem - widget factory', async t => {
  const makeGem = {
    methodNames: ['makeWidget'],
    makeFacet: async ({ retentionSet, incarnateGem }) => {
      return {
        async makeWidget() {
          const widget = await incarnateGem({
            name: 'widget',
            methodNames: ['sayHi'],
            code: 'async () => ({ sayHi: async () => "hi im a widget" })',
          });
          // you probably wouldnt want this to
          // manage the retention of the widget,
          // the consumer of the widget should do that.
          retentionSet.add(widget.gemId);
          return widget.farRef;
        },
      };
    },
  };

  const { aliceKit, bobKit } = makeScenario({ makeBoth: makeGem });
  // bob's bootstrap is alice and vice versa
  const alice = await bobKit.captpKit.getBootstrap();

  t.deepEqual(aliceKit.gem.retentionSet.size, 0);
  const widget1 = await E(alice).makeWidget();
  t.deepEqual(aliceKit.gem.retentionSet.size, 1);
  await aliceKit.gem.wakeController.sleep();

  t.deepEqual(aliceKit.gem.retentionSet.size, 1);
  const widget2 = await E(alice).makeWidget();
  t.deepEqual(aliceKit.gem.retentionSet.size, 2);

  await E(widget1).sayHi();
  await E(widget2).sayHi();

  t.pass();
});
