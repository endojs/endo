import test from 'ava';
import { whereEndoSock } from '../index.js';

test('windows', t => {
  t.is(
    // @ts-expect-error Expected 3-4 arguments
    whereEndoSock('win32', {
      XDG_RUNTIME_DIR: 'IGNOREME', // Not necessarily suitable for named pipes
      USERNAME: 'alice',
    }),
    '\\\\?\\pipe\\alice-Endo\\captp0.pipe',
    'Use Windows named pipe namespace, scoped to the user when possible',
  );
  t.is(
    whereEndoSock(
      'win32',
      {},
      // @ts-expect-error Missing properties
      {
        user: 'Bill',
      },
    ),
    '\\\\?\\pipe\\Bill-Endo\\captp0.pipe',
    'Under duress, fall back to a location shared by all users',
  );
});

test('darwin', t => {
  t.is(
    // @ts-expect-error Expected 3-4 arguments
    whereEndoSock('darwin', {
      XDG_RUNTIME_DIR: '/var/run/user/alice',
      USER: 'IGNOREME',
    }),
    '/var/run/user/alice/endo/captp0.sock',
    'Favor XDG over local conventions, even on a Mac',
  );
  t.is(
    // @ts-expect-error Expected 3-4 arguments
    whereEndoSock('darwin', {
      HOME: '/Users/alice',
    }),
    '/Users/alice/Library/Application Support/Endo/captp0.sock',
    'Infer Darwin/Mac conventional socket location from HOME',
  );
  t.is(
    whereEndoSock(
      'darwin',
      {},
      // @ts-expect-error Missing properties
      {
        home: '/Users/alice',
      },
    ),
    '/Users/alice/Library/Application Support/Endo/captp0.sock',
    'Fall through to system-provided home',
  );
});

test('linux', t => {
  t.is(
    // @ts-expect-error Expected 3-4 arguments
    whereEndoSock('linux', {
      XDG_RUNTIME_DIR: '/var/run/user/alice',
      USER: 'IGNOREME',
    }),
    '/var/run/user/alice/endo/captp0.sock',
    'XDG takes precedence over USER on Linux',
  );
  t.is(
    whereEndoSock(
      'linux',
      {
        USER: 'alice',
      },
      // @ts-expect-error Missing properties
      {
        temp: '/tmp/volume/0',
      },
    ),
    '/tmp/volume/0/endo-alice/captp0.sock',
    'Under duress, fall back to host provided temporary directory',
  );
});
