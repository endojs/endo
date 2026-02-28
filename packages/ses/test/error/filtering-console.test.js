import test from 'ava';
import { filterConsole } from '@endo/error-console-internal';
import '../../index.js';
import { assertLogs } from './_throws-and-logs.js';

lockdown();

test('filtering console', t => {
  assertLogs(t, () => {
    // sampled inside the thunk, in the environment set up by
    // assertLogs
    const testingConsole = console;
    let filterFlag = true;
    const filter = { canLog: _severity => filterFlag };
    const filteringConsole = filterConsole(testingConsole, filter);
    filteringConsole.log('foo');
    filterFlag = false;
    filteringConsole.log('bar');
    filterFlag = true;
    filteringConsole.log('baz');
  }, [
    ['log', 'foo'],
    ['log', 'baz'],
  ]);
});
