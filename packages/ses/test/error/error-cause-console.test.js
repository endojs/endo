import test from 'ava';
import '../../index.js';
import { throwsAndLogs } from './throws-and-logs.js';

lockdown();

test('error cause console control', t => {
  const e1 = Error('e1');
  throwsAndLogs(
    t,
    () => {
      console.log('log1', e1);
      throw e1;
    },
    /e1/,
    [
      ['log', 'log1', '(Error#1)'],
      ['log', 'Error#1:', 'e1'],
      ['log', 'stack of Error\n'],
      ['log', 'Caught', '(Error#1)'],
    ],
    { wrapWithCausal: true },
  );
});

test('error cause console one level', t => {
  const e2 = Error('e2');
  const e1 = Error('e1', { cause: e2 });
  throwsAndLogs(
    t,
    () => {
      console.log('log1', e1);
      throw e1;
    },
    /e1/,
    [
      ['log', 'log1', '(Error#1)'],
      ['log', 'Error#1:', 'e1'],
      ['log', 'stack of Error\n'],
      ['log', 'Error#1 cause:', '(Error#2)'],
      ['group', 'Nested error under Error#1'],
      ['log', 'Error#2:', 'e2'],
      ['log', 'stack of Error\n'],
      ['groupEnd'],
      ['log', 'Caught', '(Error#1)'],
    ],
    { wrapWithCausal: true },
  );
});

test('error cause console nested', t => {
  const e3 = Error('e3');
  const e2 = Error('e2', { cause: e3 });
  const u1 = URIError('u1', { cause: e2 });
  throwsAndLogs(
    t,
    () => {
      console.log('log1', u1);
      throw u1;
    },
    /u1/,
    [
      ['log', 'log1', '(URIError#1)'],
      ['log', 'URIError#1:', 'u1'],
      ['log', 'stack of URIError\n'],
      ['log', 'URIError#1 cause:', '(Error#2)'],
      ['group', 'Nested error under URIError#1'],
      ['log', 'Error#2:', 'e2'],
      ['log', 'stack of Error\n'],
      ['log', 'Error#2 cause:', '(Error#3)'],
      ['group', 'Nested error under Error#2'],
      ['log', 'Error#3:', 'e3'],
      ['log', 'stack of Error\n'],
      ['groupEnd'],
      ['groupEnd'],
      ['log', 'Caught', '(URIError#1)'],
    ],
    { wrapWithCausal: true },
  );
});
