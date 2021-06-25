import test from 'ava';
import { throwsAndLogs } from './throws-and-logs.js';
import { assert } from '../../src/error/assert.js';

const { details: d, makeAssert } = assert;

const goodRaise = reason => {
  console.error('raising', reason);
  throw reason;
};

// A bad raise function because it returns.
const doesNotThrow = reason => {
  console.error('not throwing', reason);
};

const throwsRelated = reason => {
  const err = assert.error(d`replaces ${reason}`);
  console.error('throws something else', err);
  throw err;
};

const reenterAssert = reason => {
  console.error('about to fail');
  assert.fail(d`replaces ${reason}`);
};

const testError = URIError('test error');

const challenges = [
  [undefined, /test error/, [['log', 'Caught', URIError]]],
  [
    goodRaise,
    /test error/,
    [
      ['error', 'raising', URIError],
      ['log', 'Caught', URIError],
    ],
  ],
  [
    doesNotThrow,
    /test error/,
    [
      ['error', 'not throwing', URIError],
      ['log', 'Caught', URIError],
    ],
  ],
  [
    throwsRelated,
    /replaces/,
    [
      ['error', 'throws something else', Error],
      ['log', 'Caught', Error],
    ],
  ],
  [
    reenterAssert,
    /replaces/,
    [
      ['error', 'about to fail'],
      ['log', 'Caught', Error],
    ],
  ],
];

for (const [optRaise, regexp, goldenLog] of challenges) {
  const testName = optRaise ? optRaise.name : 'noRaise';
  const testAssert = makeAssert(optRaise);
  test(`makeAssert of ${testName}`, t => {
    throwsAndLogs(t, () => testAssert.raise(testError), regexp, goldenLog);
  });
}

test('makeAssert reenters same assert', t => {
  const reenterSameAssert = reason => {
    console.error('about to reenter', reason);
    // eslint-disable-next-line no-use-before-define
    testAssert.fail(d`replaces ${reason}`);
  };
  const testAssert = makeAssert(reenterSameAssert);
  throwsAndLogs(t, () => testAssert.raise(testError), /replaces/, [
    ['error', 'about to reenter', URIError],
    ['error', 'Failed to raise. Just throwing', Error],
    ['log', 'Caught', Error],
  ]);
});
