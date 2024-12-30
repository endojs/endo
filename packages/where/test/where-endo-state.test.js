import test from 'ava';
import { whereEndoState } from '../index.js';

test('windows', t => {
  t.is(
    // @ts-expect-error Expected 3 arguments, but got 2.
    whereEndoState('win32', {
      LOCALAPPDATA: 'C:\\Users\\Alice\\AppData\\Local',
      APPDATA: 'IGNOREME',
      USERPROFILE: 'IGNOREME',
      HOMEDRIVE: 'IGNOREME',
      HOMEPATH: 'IGNOREME',
    }),
    'C:\\Users\\Alice\\AppData\\Local\\Endo',
    'Use LOCALAPPDATA for Endo state if available',
  );
  t.is(
    // @ts-expect-error Expected 3 arguments, but got 2.
    whereEndoState('win32', {
      APPDATA: 'C:\\Users\\Alice\\AppData',
      USERPROFILE: 'IGNOREME',
      HOMEDRIVE: 'IGNOREME',
      HOMEPATH: 'IGNOREME',
    }),
    'C:\\Users\\Alice\\AppData\\Local\\Endo',
    'Infer LOCALAPPDATA from APPDATA if necessary and possible',
  );
  t.is(
    // @ts-expect-error Expected 3 arguments, but got 2.
    whereEndoState('win32', {
      USERPROFILE: 'C:\\Users\\Alice',
      HOMEDRIVE: 'IGNOREME',
      HOMEPATH: 'IGNOREME',
    }),
    'C:\\Users\\Alice\\AppData\\Local\\Endo',
    'Infer LOCALAPPDATA from USERPROFILE if necessary and possible',
  );
  t.is(
    // @ts-expect-error Expected 3 arguments, but got 2.
    whereEndoState('win32', {
      HOMEDRIVE: 'C:\\',
      HOMEPATH: 'Users\\Alice',
    }),
    'C:\\Users\\Alice\\AppData\\Local\\Endo',
    'Infer LOCALAPPDATA from HOMEDRIVE and HOMEPATH if necessary and possible',
  );
  t.is(
    whereEndoState(
      'win32',
      {},
      {
        home: 'C:\\Users\\Bill',
      },
    ),
    'C:\\Users\\Bill\\AppData\\Local\\Endo',
    'Fall back to system-provided home',
  );
});

test('darwin', t => {
  t.is(
    // @ts-expect-error Expected 3 arguments, but got 2.
    whereEndoState('darwin', {
      XDG_STATE_HOME: '/Users/alice/.local/state',
      XDG_CONFIG_HOME: 'IGNOREME',
      HOME: 'IGNOREME',
    }),
    '/Users/alice/.local/state/endo',
    'Favor XDG state home over Darwin conventions if provided by the user',
  );
  t.is(
    // @ts-expect-error Expected 3 arguments, but got 2.
    whereEndoState('darwin', {
      HOME: '/Users/alice',
    }),
    '/Users/alice/Library/Application Support/Endo',
    'Use the Mac/Darwin conventional location for Application user data',
  );
  t.is(
    whereEndoState(
      'darwin',
      {},
      {
        home: '/Users/Johnny',
      },
    ),
    '/Users/Johnny/Library/Application Support/Endo',
    'Fall back to system-provided home',
  );
});

test('linux', t => {
  t.is(
    // @ts-expect-error Expected 3 arguments, but got 2.
    whereEndoState('linux', {
      XDG_STATE_HOME: '/Users/alice/.local/state',
      XDG_CONFIG_HOME: 'IGNOREME',
      HOME: 'IGNOREME',
    }),
    '/Users/alice/.local/state/endo',
    'Use XDG state home if provided by the user',
  );
  t.is(
    // @ts-expect-error Expected 3 arguments, but got 2.
    whereEndoState('linux', {
      HOME: '/Users/alice',
    }),
    '/Users/alice/.local/state/endo',
    'Infer XDG state home from HOME on Linux',
  );
  t.is(
    whereEndoState(
      'linux',
      {},
      {
        home: '/home/homer',
      },
    ),
    '/home/homer/.local/state/endo',
    'For lack of any useful environment information, fall back to a relative path',
  );
});
