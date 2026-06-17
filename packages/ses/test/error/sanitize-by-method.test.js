import test from 'ava';
import '../../index.js';
import {
  consoleLevelMethods,
  consoleSpecialMethods,
  consoleOtherMethods,
} from '../../src/error/console.js';
import { assertLogs } from './_throws-and-logs.js';

lockdown();

// We use error so we can tell whether the console treats these as
// format string args, even if there is no format string (timeLog)
const err2 = new Error('E coli');
const err1 = new Error('guinea pig', { cause: err2 });

test('console sanitize by method', t => {
  assertLogs(
    t,
    () => {
      console.log('a%cb', err2, err1);
    },
    // without causal console, no sanitizing
    [['log', 'a%cb', err2, err1]],
  );

  for (const [name, level] of consoleLevelMethods) {
    assertLogs(
      t,
      () => {
        // @ts-ignore Of course it doesn't know the type of an indexed get
        console[name]('a%cb', err2, err1);
      },
      [
        // causal console sanitizes console format string and matching args
        // of level-methods
        // causal console sanitizes console format string and matching args
        // of level-methods
        [name, 'ab', '(Error#1)'],
        [level, 'Error#1:', 'guinea pig'],
        [level, `stack of Error\n`],
        [level, 'Error#1 cause:', '(Error#2)'],
        ['group', 'Nested error under Error#1'],
        [level, 'Error#2:', 'E coli'],
        [level, `stack of Error\n`],
        ['groupEnd'],
      ],
      {
        wrapWithCausal: true,
      },
    );
  }

  assertLogs(
    t,
    () => {
      for (const [name, level] of consoleSpecialMethods) {
        switch (name) {
          case 'assert': {
            t.is(level, 'error');
            // normal level args shifted one
            console.assert(true, 'a%cb', err2, err1);
            console.assert(false, 'a%cb', err2, err1);
            break;
          }
          case 'timeLog': {
            t.is(level, 'log');
            console.timeLog('a%cb', err2, err1);
            break;
          }
          default: {
            throw new Error(`unexpected special console method ${name}`);
          }
        }
      }
    },
    [
      // each special method is its own case
      ['assert', true, 'ab', '(Error#1)'],
      ['error', 'Error#1:', 'guinea pig'],
      ['error', 'stack of Error\n'],
      ['error', 'Error#1 cause:', '(Error#2)'],
      ['group', 'Nested error under Error#1'],
      ['error', 'Error#2:', 'E coli'],
      ['error', 'stack of Error\n'],
      ['groupEnd'],
      // each special method is its own case
      ['assert', false, 'ab', '(Error#1)'],
      // each special method is its own case
      ['timeLog', 'a%cb', '(Error#2)', '(Error#1)'],
      ['group', 'Nested 2 errors'],
      ['groupEnd'],
    ],
    {
      wrapWithCausal: true,
    },
  );

  for (const [name, _] of consoleOtherMethods) {
    assertLogs(
      t,
      () => {
        // @ts-ignore Of course it doesn't know the type of an indexed get
        console[name]('a%cb', err2, err1);
      },
      [
        // causal console does not santize other-methods, since they have
        // no format strings.
        [name, 'a%cb', err2, err1],
      ],
      {
        wrapWithCausal: true,
      },
    );
  }
});
