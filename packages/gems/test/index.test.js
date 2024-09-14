import test from '@endo/ses-ava/prepare-endo.js';
import '@agoric/swingset-liveslots/tools/setup-vat-data.js';
import { E } from '@endo/far';
import { M } from '@endo/patterns';
import { makeVat } from './util.js';

/*

TODO:
  - [ ] test teardown / reincarnation
  - [ ] test ChildClass registrations
  - [ ] flatten gem class registry
  - [ ] figure out gem class registry GC

*/

test('persistence - simple json counter', async t => {
  const gemName = 'CounterGem';
  const gemRecipe = {
    name: gemName,
    code: `${({ M, gemName, getStore }) => ({
      interface: M.interface(gemName, {
        increment: M.callWhen().returns(M.number()),
        getCount: M.callWhen().returns(M.number()),
      }),
      init: () => ({ count: 0 }),
      methods: {
        async increment() {
          const store = getStore(this.self);
          let { count } = store.get();
          count += 1;
          store.set({ count });
          return count;
        },
        async getCount() {
          const store = getStore(this.self);
          const { count } = store.get();
          return count;
        },
      },
    })}`
  };

  const vat = makeVat();
  let kernel = vat.restart();
  let counter = kernel.makeGem(gemRecipe);
  kernel.store.init('counter', counter);

  t.deepEqual(await E(counter).getCount(), 0);
  await E(counter).increment();
  t.deepEqual(await E(counter).getCount(), 1);

  kernel = vat.restart();
  counter = kernel.store.get('counter');

  t.deepEqual(await E(counter).getCount(), 1);
  await Promise.all([E(counter).increment(), E(counter).increment()]);
  t.deepEqual(await E(counter).getCount(), 3);
});

// TODO: need to untangle captp remote refs for persistence
test('kumavis store - serialization of gem refs', async t => {
  const friendsListRecipe = {
    name: 'FriendsList',
    code: `${({ M, gemName, getStore }) => ({
      interface: M.interface(gemName, {
        addFriend: M.call(M.any()).returns(M.string()),
        getFriends: M.call().returns(M.any()),
      }),
      init: () => ({ friends: [] }),
      methods: {
        addFriend(friend) {
          const store = getStore(this.self);
          const { friends } = store.get();
          store.set({ friends: [...friends, friend] });
          return `added friend ${friend} (${friends.length} friends total)`;
        },
        getFriends() {
          const store = getStore(this.self);
          const { friends } = store.get();
          return friends;
        },
      },
    })}`
  };

  const friendRecipe = {
    name: 'Friend',
    code: `${({ M, gemName }) => ({
      interface: M.interface(gemName, {}),
      methods: {},
    })}`
  };

  const vat = makeVat();
  let kernel = vat.restart();
  let friendsList = kernel.makeGem(friendsListRecipe);
  kernel.store.init('friendsList', friendsList);
  let friend = kernel.makeGem(friendRecipe);
  kernel.store.init('friend', friend);

  t.deepEqual(friendsList.getFriends(), []);
  friendsList.addFriend(friend);
  t.deepEqual(friendsList.getFriends(), [friend]);

  kernel = vat.restart();
  friendsList = kernel.store.get('friendsList');
  friend = kernel.store.get('friend');

  t.deepEqual(friendsList.getFriends(), [friend]);
});

test.skip('makeGem - widget factory', async t => {
  const gemName = 'WidgetGem';
  const gemRecipe = {
    name: gemName,
    interface: M.interface(gemName, {
      makeWidget: M.callWhen().returns(M.any()),
    }),
    init: () => ({ widgets: [] }),
    methods: {
      async makeWidget() {
        const { gems } = this.state.powers;
        const widget = gems.incarnateEvalGem({
          name: 'widget',
          interface: M.interface('Widget', {
            sayHi: M.callWhen().returns(M.string()),
          }),
          code: '({ sayHi: async () => "hi im a widget" })',
        });
        // you probably wouldnt want this to
        // manage the retention of the widget,
        // the consumer of the widget should do that.
        const { store } = this.state;
        const { widgets } = store.get('state');
        store.set('state', { widgets: [...widgets, widget] });
        return widget;
      },
    },
  };

  const { aliceKit, bobKit } = makeScenario({ recipeForBoth: gemRecipe });
  // bob's bootstrap is alice and vice versa
  const alice = await bobKit.captpKit.getBootstrap();

  // t.deepEqual(aliceKit.gem.retentionSet.size, 0);
  const widget1 = await E(alice).makeWidget();
  // t.deepEqual(aliceKit.gem.retentionSet.size, 1);
  // await aliceKit.gem.wakeController.sleep();

  // t.deepEqual(aliceKit.gem.retentionSet.size, 1);
  const widget2 = await E(alice).makeWidget();
  // t.deepEqual(aliceKit.gem.retentionSet.size, 2);

  await E(widget1).sayHi();
  await E(widget2).sayHi();

  t.pass();
});
