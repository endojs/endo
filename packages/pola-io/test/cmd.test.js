import test from 'ava';
import { makeCmdRunner } from '../src/cmd.js';

const { isFrozen } = Object;

const mockExecFile = () => Promise.resolve({ stdout: '', stderr: '' });

test('makeCmdRunner returns frozen object', t => {
  const cmdRunner = makeCmdRunner('ls', { execFile: mockExecFile });
  t.true(isFrozen(cmdRunner), 'CmdRunner object should be frozen');
});

test('makeCmdRunner subCommand returns frozen object', t => {
  const cmdRunner = makeCmdRunner('git', { execFile: mockExecFile });
  const subCmd = cmdRunner.subCommand('status');
  t.true(isFrozen(subCmd), 'SubCommand object should be frozen');
});

test('makeCmdRunner withFlags returns frozen object', t => {
  const cmdRunner = makeCmdRunner('ls', { execFile: mockExecFile });
  const withFlags = cmdRunner.withFlags('-la');
  t.true(isFrozen(withFlags), 'WithFlags object should be frozen');
});
