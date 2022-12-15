import test from 'ava';
import { whereEndoSock } from '../index.js';

test('windows', t => {
  t.is(
    whereEndoSock('win32', {
      XDG_RUNTIME_DIR: 'IGNOREME', // Not necessarily suitable for named pipes
      USERNAME: 'alice',
    }),
    '\\\\?\\pipe\\alice-Endo\\endo.pipe',
    'Use Windows named pipe namespace, scoped to the user when possible',
  );
  t.is(
    whereEndoSock('win32', {}),
    '\\\\?\\pipe\\Endo\\endo.pipe',
    'Under duress, fall back to a location shared by all users',
  );
});

test('darwin', t => {
  t.is(
    whereEndoSock('darwin', {
      XDG_RUNTIME_DIR: '/var/run/user/alice',
      USER: 'IGNOREME',
    }),
    '/var/run/user/alice/endo/endo.sock',
    'Favor XDG over local conventions, even on a Mac',
  );
  t.is(
    whereEndoSock('darwin', {
      HOME: '/Users/alice',
    }),
    '/Users/alice/Library/Application Support/Endo/endo.sock',
    'Infer Darwin/Mac conventional socket location from HOME',
  );
  t.is(
    whereEndoSock('darwin', {}),
    'endo/endo.sock',
    'Under duress, fall through to a relative path',
  );
});

test('linux', t => {
  t.is(
    whereEndoSock('linux', {
      XDG_RUNTIME_DIR: '/var/run/user/alice',
      USER: 'IGNOREME',
    }),
    '/var/run/user/alice/endo/endo.sock',
    'XDG takes precedence over USER on Linux',
  );
  t.is(
    whereEndoSock('linux', {
      USER: 'alice',
    }),
    '/tmp/endo-alice/endo.sock',
    'Under duress, assume the host has a /tmp file system and scope the UNIX domain socket to the user by name',
  );
  t.is(
    whereEndoSock('linux', {}),
    'endo/endo.sock',
    'Under extreme duress, just use a relative path for the socket',
  );
});
