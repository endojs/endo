import test from 'ava';
import { $ } from 'execa';
import { makeSectionTest } from '../_section.js';
import { withContext } from '../_with-context.js';
import { daemonContext } from '../_daemon-context.js';
import * as counterExample from './counter-example.js';
import * as doublerAgent from './doubler-agent.js';
import * as confinedScript from './confined-script.js';
import * as sendingMessages from './sending-messages.js';
import * as namesInTransit from './names-in-transit.js';
import * as mailboxesAreSymmetric from './mailboxes-are-symmetric.js';

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

test.serial(
  'counter-example',
  makeSectionTest(
    $({ cwd: 'demo' }),
    withContext(daemonContext)(counterExample.section),
  ),
);

test.serial(
  'doubler-agent',
  makeSectionTest(
    $({ cwd: 'demo' }),
    withContext(daemonContext, counterExample.context)(doublerAgent.section),
  ),
);

test.serial(
  'sending-messages',
  makeSectionTest(
    $({ cwd: 'demo' }),
    withContext(
      daemonContext,
      counterExample.context,
      doublerAgent.context,
    )(sendingMessages.section),
  ),
);

test.serial(
  'names-in-transit',
  makeSectionTest(
    $({ cwd: 'demo' }),
    withContext(
      daemonContext,
      counterExample.context,
      doublerAgent.context,
      sendingMessages.context,
    )(namesInTransit.section),
  ),
);

test.serial(
  'mailboxes-are-symmetric',
  makeSectionTest(
    $({ cwd: 'demo' }),
    withContext(
      daemonContext,
      counterExample.context,
      doublerAgent.context,
      sendingMessages.context,
      namesInTransit.context,
    )(mailboxesAreSymmetric.section),
  ),
);

test.serial(
  'confined-script',
  makeSectionTest(
    $({ cwd: 'demo' }),
    withContext(daemonContext)(confinedScript.section),
  ),
);
