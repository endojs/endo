import { test } from './prepare-test-env-ava.js';

// eslint-disable-next-line import/order
import { Far, passStyleOf, Remotable } from '@endo/pass-style';
import { makeMarshal } from '../src/marshal.js';

const { create } = Object;

const alice = Far('alice');
const bob1 = Far('bob');
const bob2 = Far('bob');

const convertValToSlot = val =>
  passStyleOf(val) === 'remotable' ? 'far' : val;
/** @type {(slot: unknown, iface?: string) => unknown} */
const convertSlotToVal = (slot, iface = undefined) =>
  slot === 'far' ? Remotable(iface) : slot;
const { fromCapData, toCapData } = makeMarshal(
  convertValToSlot,
  convertSlotToVal,
  { serializeBodyFormat: 'smallcaps' },
);

const bob3 = fromCapData(toCapData(bob1));

test('ava deepEqual on remotables compares ifaces', t => {
  t.notDeepEqual(alice, bob1);
  t.deepEqual(bob1, bob2);
  t.notDeepEqual(alice, bob3);
  t.deepEqual(bob1, bob3);
  t.deepEqual(bob2, bob3);
});

const bob4 = harden(
  create(Object.prototype, {
    [Symbol.toStringTag]: {
      value: 'Alleged: bob',
      enumerable: false,
    },
  }),
);

const bob5 = harden({ __proto__: bob4 });
const bob6 = harden({
  [Symbol.toStringTag]: 'Alleged: bob',
});
const bob7 = harden({ __proto__: bob6 });
const bob8 = harden({
  __proto__: {
    [Symbol.toStringTag]: 'Alleged: bob',
    foo: 'x',
  },
});

test('ava deepEqual related edge cases', t => {
  t.deepEqual(bob1, bob4);
  t.deepEqual(bob1, bob5);
  t.notDeepEqual(bob1, bob6);
  t.deepEqual(bob1, bob7);
  t.notDeepEqual(bob6, bob7);
  t.deepEqual(bob1, bob8);
});

const peter = harden(Promise.resolve('peter'));
const paula = harden(Promise.resolve('paula'));
const phantom1 = fromCapData(toCapData(peter));
const phantom2 = fromCapData(toCapData(paula));

test('ava deepEqual on promises compares only identity', t => {
  t.notDeepEqual(peter, paula);
  t.deepEqual(peter, phantom1);
  t.notDeepEqual(peter, phantom2);
  t.notDeepEqual(phantom1, phantom2);
});
