/* global process */
import test from 'ava';
import { $ } from 'execa';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { makeSectionTest } from '../_section.js';
import { withContext } from '../_with-context.js';
import { daemonContext } from '../_daemon-context.js';
import { netListenAllowed } from '../_net-permission.js';
import * as counterExample from './counter-example.js';
import * as doublerAgent from './doubler-agent.js';
import * as confinedScript from './confined-script.js';
import * as sendingMessages from './sending-messages.js';
import * as namesInTransit from './names-in-transit.js';
import * as mailboxesAreSymmetric from './mailboxes-are-symmetric.js';

const testSerial = netListenAllowed ? test.serial : test.serial.skip;
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'endo-cli-'));
const runtimeDir = path.join(tempRoot, 'run');
fs.mkdirSync(path.join(runtimeDir, 'endo'), { recursive: true });
const env = {
  ...process.env,
  XDG_STATE_HOME: path.join(tempRoot, 'state'),
  XDG_CACHE_HOME: path.join(tempRoot, 'cache'),
  XDG_RUNTIME_DIR: runtimeDir,
};
const execaDemo = $({ cwd: 'demo', env });

testSerial(
  'trivial',
  makeSectionTest(
    execaDemo,
    withContext(daemonContext)(async (execa, testLine) => {
      const maxim = 'a failing test is better than failure to test';
      await testLine(execa`echo ${maxim}`, { stdout: maxim });
    }),
  ),
);

testSerial(
  'counter-example',
  makeSectionTest(
    execaDemo,
    withContext(daemonContext)(counterExample.section),
  ),
);

testSerial(
  'doubler-agent',
  makeSectionTest(
    execaDemo,
    withContext(daemonContext, counterExample.context)(doublerAgent.section),
  ),
);

testSerial(
  'sending-messages',
  makeSectionTest(
    execaDemo,
    withContext(
      daemonContext,
      counterExample.context,
      doublerAgent.context,
    )(sendingMessages.section),
  ),
);

testSerial(
  'names-in-transit',
  makeSectionTest(
    execaDemo,
    withContext(
      daemonContext,
      counterExample.context,
      doublerAgent.context,
      sendingMessages.context,
    )(namesInTransit.section),
  ),
);

testSerial(
  'mailboxes-are-symmetric',
  makeSectionTest(
    execaDemo,
    withContext(
      daemonContext,
      counterExample.context,
      doublerAgent.context,
      sendingMessages.context,
      namesInTransit.context,
    )(mailboxesAreSymmetric.section),
  ),
);

testSerial(
  'confined-script',
  makeSectionTest(
    execaDemo,
    withContext(daemonContext)(confinedScript.section),
  ),
);
