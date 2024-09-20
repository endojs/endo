import test from 'ava';
import '../../index.js';
import { throwsAndLogs } from './_throws-and-logs.js';

lockdown();

test('aggregate error console', t => {
  if (typeof AggregateError === 'undefined') {
    t.pass('skip test on platforms prior to AggregateError');
    return;
  }
  const e3 = Error('e3');
  const e2 = Error('e2', { cause: e3 });
  const u4 = URIError('u4', { cause: e2 });

  const a1 = AggregateError([e3, u4], 'a1', { cause: e2 });
  throwsAndLogs(
    t,
    () => {
      console.log('log1', a1);
      throw a1;
    },
    /a1/,
    [
      ['log', 'log1', '(AggregateError#1)'],
      ['log', 'AggregateError#1:', 'a1'],
      ['log', 'stack of AggregateError\n'],
      ['log', 'AggregateError#1 cause:', '(Error#2)'],
      ['log', 'AggregateError#1 errors:', '(Error#3)', '(URIError#4)'],
      ['group', 'Nested 3 errors under AggregateError#1'],
      ['log', 'Error#2:', 'e2'],
      ['log', 'stack of Error\n'],
      ['log', 'Error#2 cause:', '(Error#3)'],
      ['group', 'Nested error under Error#2'],
      ['log', 'Error#3:', 'e3'],
      ['log', 'stack of Error\n'],
      ['groupEnd'],
      ['log', 'URIError#4:', 'u4'],
      ['log', 'stack of URIError\n'],
      ['log', 'URIError#4 cause:', '(Error#2)'],
      ['group', 'Nested error under URIError#4'],
      ['groupEnd'],
      ['groupEnd'],
      ['log', 'Caught', '(AggregateError#1)'],
    ],
    { wrapWithCausal: true },
  );
});
