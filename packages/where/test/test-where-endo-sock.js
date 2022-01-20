import test from 'ava';
import { whereEndoSock } from '../index.js';

test('windows', t => {
  t.is(
    whereEndoSock('win32', {
      USERNAME: 'alice',
    }),
    '\\\\?\\pipe\\alice-Endo\\endo.pipe',
  );
  t.is(whereEndoSock('win32', {}), '\\\\?\\pipe\\Endo\\endo.pipe');
});

test('darwin', t => {
  t.is(
    whereEndoSock('darwin', {
      HOME: '/Users/alice',
    }),
    '/Users/alice/Library/Application Support/Endo/endo.sock',
  );
  t.is(whereEndoSock('darwin', {}), 'endo.sock');
});

test('linux', t => {
  t.is(
    whereEndoSock('linux', {
      XDG_RUNTIME_DIR: '/var/run/user/alice',
      USER: 'alice',
    }),
    '/var/run/user/alice/endo/endo.sock',
  );
  t.is(
    whereEndoSock('linux', {
      USER: 'alice',
    }),
    '/tmp/endo-alice/endo.sock',
  );
  t.is(whereEndoSock('linux', {}), 'endo.sock');
});
