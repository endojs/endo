import test from '@endo/ses-ava/prepare-endo.js';
import { $ } from 'execa';
import { makeSectionTest } from './section.js';
import { withContext as withContextDaemon } from './daemon.js';

test.serial(
  'trivial',
  makeSectionTest($({ cwd: 'demo' }), async (execa, testLine) => {
    await withContextDaemon(execa, async () => {
      const maxim = 'a failing test is better than failure to test';
      await testLine(execa`echo ${maxim}`, { stdout: maxim });
    });
  }),
);
