import { default as testFn } from '@endo/ses-ava/prepare-endo.js';
import '@agoric/swingset-liveslots/tools/setup-vat-data.js';
import { E } from '@endo/captp';
import { makeKernelFactory } from './util.js';

// All these tests must be serial.
// There can only be one kernel per Realm due to the use of
// vomkit. see reincarnate() in setup-vat-data.js
const test = testFn.serial;
const { restart, clear } = makeKernelFactory();

// always (even on failure) clear the kernel state after each test
testFn.afterEach.always(async t => {
  await clear();
});

test('persistence - simple json counter', async t => {
  const recipe = `${({ M, name }) => ({
    interfaceGuards: M.interface(name, {
      increment: M.call().returns(M.number()),
      getCount: M.call().returns(M.number()),
    }),
    initFn: (count = 0) => ({ count }),
    methods: {
      increment() {
        this.state.count += 1;
        return this.state.count;
      },
      getCount() {
        return this.state.count;
      },
    },
  })}`;

  let { kernel } = await restart();

  const makeCounter = kernel.vatSupervisor.registerClass('Counter', recipe);
  let counter = makeCounter(3);
  kernel.store.init('counter', counter);

  t.deepEqual(counter.getCount(), 3);
  counter.increment();
  t.deepEqual(counter.getCount(), 4);

  ({ kernel } = await restart());
  counter = kernel.store.get('counter');

  t.deepEqual(counter.getCount(), 4);
  counter.increment();
  counter.increment();
  t.deepEqual(counter.getCount(), 6);
});

// TODO: need to untangle captp remote refs for persistence
test('persistence - exo refs in state', async t => {
  const friendsListRecipe = `${({ M, name }) => ({
    interfaceGuards: M.interface(name, {
      addFriend: M.call(M.any()).returns(M.string()),
      getFriends: M.call().returns(M.any()),
    }),
    initFn: () => harden({ friends: [] }),
    methods: {
      addFriend(friend) {
        this.state.friends = harden([...this.state.friends, friend]);
        return `added friend ${friend} (${this.state.friends.length} friends total)`;
      },
      getFriends() {
        return this.state.friends;
      },
    },
  })}`;

  const friendRecipe = `${() => ({
    methods: {},
  })}`;

  let { kernel } = await restart();

  const makeFriendsList = kernel.vatSupervisor.registerClass(
    'FriendsList',
    friendsListRecipe,
  );
  let friendsList = makeFriendsList();
  kernel.store.init('friendsList', friendsList);
  const makeFriend = kernel.vatSupervisor.registerClass('Friend', friendRecipe);
  let friend = makeFriend();
  kernel.store.init('friend', friend);

  t.deepEqual(friendsList.getFriends(), []);
  friendsList.addFriend(friend);
  t.deepEqual(friendsList.getFriends(), [friend]);

  ({ kernel } = await restart());
  friendsList = kernel.store.get('friendsList');
  friend = kernel.store.get('friend');

  t.deepEqual(friendsList.getFriends(), [friend]);
});

test('persistence - cross-vat refs in state', async t => {
  const friendsListRecipe = `${({ M, name }) => ({
    interfaceGuards: M.interface(name, {
      addFriend: M.call(M.any()).returns(M.string()),
      getFriends: M.call().returns(M.any()),
    }),
    initFn: () => harden({ friends: [] }),
    methods: {
      addFriend(friend) {
        this.state.friends = harden([...this.state.friends, friend]);
        return `added friend ${friend} (${this.state.friends.length} friends total)`;
      },
      getFriends() {
        return this.state.friends;
      },
    },
  })}`;

  const friendRecipe = `${() => ({
    methods: {
      greet() {
        return 'hello';
      },
    },
  })}`;

  let { kernel } = await restart();

  const makeFriendsList = kernel.vatSupervisor.registerClass(
    'FriendsList',
    friendsListRecipe,
  );
  let friendsList = makeFriendsList();
  kernel.store.init('friendsList', friendsList);

  let foreignFriend = await E(kernel.workerFacet).incubate(`
    const recipe = ${JSON.stringify(friendRecipe)};
    const makeFriend = registerClass('Friend', recipe);
    makeFriend();
  `);
  kernel.store.init('friend', foreignFriend);
  t.deepEqual(await E(foreignFriend).greet(), 'hello');

  t.deepEqual(friendsList.getFriends(), []);
  friendsList.addFriend(foreignFriend);
  t.deepEqual(friendsList.getFriends(), [foreignFriend]);

  ({ kernel } = await restart());
  friendsList = kernel.store.get('friendsList');
  // NOTE: this friend is a promise for a presence,
  // despite the presence being directly put into the store
  foreignFriend = kernel.store.get('friend');
  t.deepEqual(await E(foreignFriend).greet(), 'hello');

  t.deepEqual(friendsList.getFriends(), [foreignFriend]);
});

test('registerIncubation - defineClass', async t => {
  const incubationCode = `(${() => {
    const makePingPong = defineClass('PingPong', {
      interfaceGuards: M.interface('PingPong', {
        ping: M.call().returns(M.string()),
      }),
      initFn: () => harden({}),
      methods: {
        ping() {
          return 'pong';
        },
      },
    });

    if (firstTime) {
      return makePingPong();
    }
  }})()`;

  let { kernel } = await restart();

  let pingPong = kernel.vatSupervisor.registerIncubation(
    'PingPong',
    incubationCode,
  );
  kernel.store.init('pingPong', pingPong);

  t.deepEqual(pingPong.ping(), 'pong');

  ({ kernel } = await restart());

  pingPong = kernel.store.get('pingPong');
  t.deepEqual(pingPong.ping(), 'pong');
});

test('registerIncubation - js class constructor is durable', async t => {
  const incubationCode = `
    defineJsClass(class PingPong {
      implements = M.interface('PingPong', {
        ping: M.call().returns(M.string()),
      })
      init () { return harden({}) }
      ping() { return 'pong' }
    });
  `;

  let { kernel } = await restart();

  const makeFn = kernel.vatSupervisor.registerIncubation(
    'PingPong',
    incubationCode,
  );
  kernel.store.init('makePingPong', makeFn);

  let makePingPong = kernel.store.get('makePingPong');
  const pingPong1 = makePingPong();
  t.deepEqual(pingPong1.ping(), 'pong');

  ({ kernel } = await restart());

  makePingPong = kernel.store.get('makePingPong');
  const pingPong2 = makePingPong();
  t.deepEqual(pingPong2.ping(), 'pong');
});

test('registerIncubation - register with exo endowments', async t => {
  const pingPongIncubationCode = `
    defineJsClass(class PingPong {
      implements = M.interface('PingPong', {
        ping: M.call().returns(M.string()),
      })
      init () { return harden({}) }
      ping() { return 'pong' }
    });
  `;
  const forwarderIncubationCode = `
    defineJsClass(class Forwarder {
      forward(selector) { return E(target)[selector]() }
    });
  `;

  let { kernel } = await restart();

  const makePingPong = kernel.vatSupervisor.registerIncubation(
    'PingPong',
    pingPongIncubationCode,
  );
  const pingPong = makePingPong();

  const makeForwarder = kernel.vatSupervisor.registerIncubation(
    'Forwarder',
    forwarderIncubationCode,
    { target: pingPong },
  );

  let forwarder = makeForwarder();
  kernel.store.init('forwarder', forwarder);

  ({ kernel } = await restart());

  forwarder = kernel.store.get('forwarder');
  t.deepEqual(await E(forwarder).forward('ping'), 'pong');
});

// Need a way of creating a class that uses another class -- maybe exoClassKit?
// maybe putting makeNewInstance fn in the store?
test.skip('persistence - widget factory', async t => {
  const widgetFactoryRecipe = `${({
    M,
    gemName,
    registerChildClass,
    lookupChildGemClass,
  }) => {
    registerChildClass({
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
  }}`;

  let kernel = restart();
  let widgetFactory = kernel.makeGem('WidgetFactory', widgetFactoryRecipe);
  kernel.store.init('widgetFactory', widgetFactory);

  let widget = widgetFactory.makeWidget();
  kernel.store.init('widget', widget);

  t.deepEqual(widget.sayHi(), 'hi im a widget');

  kernel = restart();
  widgetFactory = kernel.store.get('widgetFactory');
  widget = kernel.store.get('widget');

  t.deepEqual(widget.sayHi(), 'hi im a widget');
  const widget2 = widgetFactory.makeWidget();
  kernel.store.init('widget2', widget2);
  t.deepEqual(widget2.sayHi(), 'hi im a widget');

  t.pass();
});
