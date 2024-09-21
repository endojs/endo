import test from '@endo/ses-ava/prepare-endo.js';
import '@agoric/swingset-liveslots/tools/setup-vat-data.js';
import { makeVat } from './util.js';

test('persistence - simple json counter', async t => {
  const gemRecipe = {
    name: 'CounterGem',
    code: `${({ M, gemName }) => ({
      interface: M.interface(gemName, {
        increment: M.call().returns(M.number()),
        getCount: M.call().returns(M.number()),
      }),
      init: (count = 0) => ({ count }),
      methods: {
        increment() {
          this.state.count += 1;
          return this.state.count;
        },
        getCount() {
          return this.state.count;
        },
      },
    })}`,
  };

  const vat = makeVat();
  let kernel = vat.restart();
  let counter = kernel.makeGem(gemRecipe);
  kernel.store.init('counter', counter);

  t.deepEqual(counter.getCount(), 0);
  counter.increment();
  t.deepEqual(counter.getCount(), 1);

  kernel = vat.restart();
  counter = kernel.store.get('counter');

  t.deepEqual(counter.getCount(), 1);
  counter.increment();
  counter.increment();
  t.deepEqual(counter.getCount(), 3);
});

// TODO: need to untangle captp remote refs for persistence
test('kumavis store - serialization of gem refs', async t => {
  const friendsListRecipe = {
    name: 'FriendsList',
    code: `${({ M, gemName }) => ({
      interface: M.interface(gemName, {
        addFriend: M.call(M.any()).returns(M.string()),
        getFriends: M.call().returns(M.any()),
      }),
      init: () => harden({ friends: [] }),
      methods: {
        addFriend(friend) {
          this.state.friends = harden([...this.state.friends, friend]);
          return `added friend ${friend} (${this.state.friends.length} friends total)`;
        },
        getFriends() {
          return this.state.friends;
        },
      },
    })}`,
  };

  const friendRecipe = {
    name: 'Friend',
    code: `${({ M, gemName }) => ({
      interface: M.interface(gemName, {}),
      methods: {},
    })}`,
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

test('makeGem - widget factory', async t => {
  const widgetFactoryRecipe = {
    name: 'WidgetFactory',
    code: `${({ M, gemName, defineChildGem, lookupChildGemClass }) => {
      defineChildGem({
        name: 'Widget',
        code: `${({ M: M2 }) => ({
          interface: M2.interface('Widget', {
            sayHi: M2.call().returns(M2.string()),
          }),
          methods: {
            sayHi() {
              return 'hi im a widget';
            },
          },
        })}`,
      });
      return {
        interface: M.interface(gemName, {
          makeWidget: M.call().returns(M.any()),
        }),
        methods: {
          makeWidget() {
            const makeWidget = lookupChildGemClass('Widget');
            return makeWidget();
          },
        },
      };
    }}`,
  };

  const vat = makeVat();
  let kernel = vat.restart();
  let widgetFactory = kernel.makeGem(widgetFactoryRecipe);
  kernel.store.init('widgetFactory', widgetFactory);

  let widget = widgetFactory.makeWidget();
  kernel.store.init('widget', widget);

  t.deepEqual(widget.sayHi(), 'hi im a widget');

  kernel = vat.restart();
  widgetFactory = kernel.store.get('widgetFactory');
  widget = kernel.store.get('widget');

  t.deepEqual(widget.sayHi(), 'hi im a widget');
  const widget2 = widgetFactory.makeWidget();
  kernel.store.init('widget2', widget2);
  t.deepEqual(widget2.sayHi(), 'hi im a widget');

  t.pass();
});
