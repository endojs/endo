// @ts-check

import harden from '@endo/harden';
import { Far } from '@endo/marshal';
import { makePromiseKit } from '@endo/promise-kit';
import test from '@endo/ses-ava/test.js';

import { makeCapTP } from '../src/captp.js';

for (const source of ['bootstrap', 'call']) {
  test(`dropping a ${source} answer removes its pipelining target`, async t => {
    t.timeout(1000);
    const result = Far('result', { ping: () => 42 });
    const bootstrap = Far('bootstrap', { result: () => result });
    /** @type {Map<string, ReturnType<typeof makePromiseKit>>} */
    const returns = new Map();
    /** @type {Error[]} */
    const rejected = [];
    const connection = makeCapTP(
      'server',
      message => {
        if (message.type === 'CTP_RETURN')
          returns.get(message.answerID)?.resolve(message);
      },
      source === 'bootstrap' ? result : bootstrap,
      { onReject: reason => rejected.push(reason) },
    );
    t.teardown(() => connection.abort());
    const ask = async message => {
      const response = makePromiseKit();
      returns.set(message.questionID, response);
      t.true(connection.dispatch({ epoch: 0, ...message }));
      const answer = await response.promise;
      returns.delete(message.questionID);
      return answer;
    };
    await ask({ type: 'CTP_BOOTSTRAP', questionID: 'q-1' });
    let target = 'q-1';
    if (source === 'call') {
      await ask({
        type: 'CTP_CALL',
        questionID: 'q-2',
        target,
        method: connection.serialize(harden(['result', []])),
      });
      target = 'q-2';
    }
    const call = questionID => ({
      type: 'CTP_CALL',
      questionID,
      target,
      method: connection.serialize(harden(['ping', []])),
    });
    const answer = await ask(call('q-3'));
    t.is(connection.unserialize(answer.result), 42);
    t.true(
      connection.dispatch({ type: 'CTP_DROP', slotID: target, decRefs: 1 }),
    );
    t.false(connection.dispatch(call('q-4')));
    t.is(rejected.length, 1);
    t.regex(rejected[0].message, /Unknown export/);
  });
}
