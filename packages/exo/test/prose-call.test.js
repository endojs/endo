import test from '@endo/ses-ava/test.js';

import { M } from '@endo/patterns';
import {
  defineExoClass,
  callStartPattern,
  proseCall,
} from '../src/exo-makers.js';

test('test callStartPattern regexp', t => {
  t.deepEqual(callStartPattern.exec(''), null);
  t.deepEqual(
    // @ts-expect-error if `exec` returns null, this throws,
    // causing the test to fail as it should.
    [...callStartPattern.exec('incr by ')],
    ['incr by ', 'incr', 'by '],
  );
  t.deepEqual(
    [...callStartPattern.exec('incr \n \r  by ')],
    ['incr \n \r  by ', 'incr', 'by '],
  );
});

const UpCounterI = M.interface('UpCounter', {
  incr: M.proseCall`by ${M.nat()}`.proseReturns`new value is ${M.nat()}`,
});

const makeUpCounter = defineExoClass(
  'upCounter',
  UpCounterI,
  () => ({ count: 0n }),
  {
    incr(delta) {
      const { state } = this;
      return (state.count += delta);
    },
  },
);

test('test proseCall', t => {
  let lastFullResult;
  const testResultTag = (resultTemplate, result) => {
    lastFullResult = [resultTemplate[0], result, resultTemplate[1]];
    return result;
  };
  harden(testResultTag);

  /** @type {string | undefined} */
  let lastComplaint;
  const testWarn = complaint => {
    lastComplaint = complaint;
  };

  const pc = target => proseCall(target, testResultTag, testWarn);
  harden(pc);

  const upCounter = makeUpCounter();

  t.is(upCounter.incr(2n), 2n);
  t.is(upCounter.incr(3n), 5n);
  t.is(lastFullResult, undefined);
  t.is(lastComplaint, undefined);

  // @ts-expect-error TODO fix any[] vs any[][] bug it seems
  t.is(pc(upCounter)`incr by ${4n}`, 9n);
  t.deepEqual(lastFullResult, ['new value is ', 9n, '']);
  t.is(lastComplaint, undefined);

  // @ts-expect-error TODO fix any[] vs any[][] bug it seems
  t.is(pc(upCounter)`incr y'know, that thing ${5n}`, 14n);
  t.deepEqual(lastFullResult, ['new value is ', 14n, '']);
  t.is(lastComplaint, 'args template differs from method guard expectation');
});
