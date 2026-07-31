import test from '@endo/ses-ava/test.js';

import harden from '@endo/harden';
import { makeCapTP } from '../src/captp.js';

const makeCall = (connection, method) => ({
  type: 'CTP_CALL',
  epoch: 0,
  questionID: 'q-1',
  target: 'o+1',
  method: connection.serialize(harden(method)),
});

const makeConnection = (onReject = () => {}) =>
  makeCapTP('alice', () => {}, undefined, { onReject });

test('accepts the supported decoded CapTP call shapes', t => {
  const methods = [[0], [-0], [NaN], [Infinity], [null, []], ['method', []]];

  for (const method of methods) {
    const connection = makeConnection();
    t.true(connection.dispatch(makeCall(connection, method)), String(method));
  }
});

test('rejects malformed decoded CapTP call shapes', t => {
  const methods = [
    [],
    [null],
    ['method', [], 'extra'],
    ['method', 'not-an-array'],
    'not-a-method',
    [{}, []],
  ];

  for (const method of methods) {
    const rejections = [];
    const connection = makeConnection(reason => rejections.push(reason));
    t.false(connection.dispatch(makeCall(connection, method)), String(method));
    t.is(rejections.length, 1, String(method));
    t.regex(rejections[0].message, /invalid method/);
  }
});

test('disconnects after decoding a malformed slot-bearing call', t => {
  const rejections = [];
  const imports = [];
  const messages = [];
  const connection = makeCapTP(
    'alice',
    message => messages.push(message),
    undefined,
    {
      importHook: (_value, slot) => imports.push(slot),
      onReject: reason => rejections.push(reason),
    },
  );

  const malformed = {
    body: JSON.stringify([{ '@qclass': 'slot', index: 0 }, []]),
    slots: ['o+77'],
  };
  t.false(
    connection.dispatch({
      type: 'CTP_CALL',
      epoch: 0,
      questionID: 'q-1',
      target: 'o+1',
      method: malformed,
    }),
  );
  t.deepEqual(imports, ['o-77']);
  t.is(rejections.length, 1);
  t.regex(rejections[0].message, /invalid method/);
  t.is(messages[0].type, 'CTP_DISCONNECT');
  t.false(connection.dispatch(makeCall(connection, ['method', []])));
});

const makeTrapConnection = async (
  called,
  onReject = () => {},
  importHook = () => {},
) => {
  const messages = [];
  const connection = makeCapTP(
    'alice',
    message => messages.push(message),
    undefined,
    {
      importHook,
      onReject,
      trapHost: () =>
        harden({
          async next() {
            called.push('next');
            return harden({ done: true, value: undefined });
          },
          async return() {
            called.push('return');
            return harden({ done: true, value: undefined });
          },
          async throw() {
            called.push('throw');
            return harden({ done: true, value: undefined });
          },
          steal: () => called.push('steal'),
        }),
    },
  );
  const handler = connection.makeTrapHandler('test trap', {
    getValue: () => 1,
  });
  const target = connection.serialize(handler).slots[0];
  const incomingTarget = `${target.slice(0, 1)}-${target.slice(2)}`;
  connection.dispatch({
    type: 'CTP_CALL',
    epoch: 0,
    trap: true,
    questionID: 'q-1',
    target: incomingTarget,
    method: connection.serialize(harden(['getValue', []])),
  });
  await null;
  await null;
  return { connection, messages };
};

const testTrapMethod = async (t, method) => {
  const called = [];
  const rejections = [];
  const { connection, messages } = await makeTrapConnection(called, reason =>
    rejections.push(reason),
  );
  const serialized = connection.serialize(harden([method, []]));
  t.false(
    connection.dispatch({
      type: 'CTP_TRAP_ITERATE',
      epoch: 0,
      questionID: 'q-1',
      serialized,
    }),
    method,
  );
  t.deepEqual(called, [], method);
  t.is(messages[messages.length - 1].type, 'CTP_DISCONNECT', method);
  t.false(
    connection.dispatch({
      type: 'CTP_TRAP_ITERATE',
      epoch: 0,
      questionID: 'q-1',
      serialized: connection.serialize(harden(['next', []])),
    }),
    method,
  );
  t.is(rejections.length, 1, method);
};

test('does not dispatch an arbitrary trap method', t =>
  testTrapMethod(t, 'steal'));

test('does not dispatch an inherited trap method', t =>
  testTrapMethod(t, 'constructor'));

test('does not dispatch another inherited trap method', t =>
  testTrapMethod(t, 'toString'));

test('rejects a malformed slot-bearing trap iterator method', async t => {
  const called = [];
  const imports = [];
  const { connection, messages } = await makeTrapConnection(
    called,
    () => {},
    (_value, slot) => imports.push(slot),
  );
  const malformed = {
    body: JSON.stringify([{ '@qclass': 'slot', index: 0 }, []]),
    slots: ['o+78'],
  };
  // The trap connection already has an in-flight iterator. The malformed
  // method imports a slot before its decoded type is rejected.
  t.false(
    connection.dispatch({
      type: 'CTP_TRAP_ITERATE',
      epoch: 0,
      questionID: 'q-1',
      serialized: malformed,
    }),
  );
  // The disconnect is the observable cleanup boundary for the private maps.
  t.is(messages[messages.length - 1].type, 'CTP_DISCONNECT');
  t.deepEqual(called, []);
  t.false(connection.dispatch({ type: 'CTP_TRAP_ITERATE', questionID: 'q-1' }));
  t.deepEqual(imports, ['o-78']);
});
