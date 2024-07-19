import test from 'ava';
import { $ } from 'execa';
import { makeSectionTest } from '../section.js';
import { withContext } from '../with-context.js';
import { daemonContext } from '../daemon-context.js';

test.serial(
  'trivial',
  makeSectionTest(
    $({ cwd: 'demo' }),
    withContext(daemonContext)(async (execa, testLine) => {
      const maxim = 'a failing test is better than failure to test';
      await testLine(execa`echo ${maxim}`, { stdout: maxim });
    }),
  ),
);
