import test from 'ava';
import { whereEndoEphemeralState } from '../index.js';

test('windows', t => {
  t.is(
    // @ts-expect-error Expected more arguments
    whereEndoEphemeralState('win32', {
      LOCALAPPDATA: 'C:\\Users\\Alice\\AppData\\Local',
      APPDATA: 'IGNOREME',
      USERPROFILE: 'IGNOREME',
      HOMEDRIVE: 'IGNOREME',
      HOMEPATH: 'IGNOREME',
    }),
    'C:\\Users\\Alice\\AppData\\Local\\Temp\\Endo',
    'Use LOCALAPPDATA for Endo state if available',
  );
  t.is(
    // @ts-expect-error Expected more arguments
    whereEndoEphemeralState('win32', {
      APPDATA: 'C:\\Users\\Alice\\AppData',
      USERPROFILE: 'IGNOREME',
      HOMEDRIVE: 'IGNOREME',
      HOMEPATH: 'IGNOREME',
    }),
    'C:\\Users\\Alice\\AppData\\Local\\Temp\\Endo',
    'Infer LOCALAPPDATA from APPDATA if necessary and possible',
  );
  t.is(
    // @ts-expect-error Expected more arguments
    whereEndoEphemeralState('win32', {
      USERPROFILE: 'C:\\Users\\Alice',
      HOMEDRIVE: 'IGNOREME',
      HOMEPATH: 'IGNOREME',
    }),
    'C:\\Users\\Alice\\AppData\\Local\\Temp\\Endo',
    'Infer LOCALAPPDATA from USERPROFILE if necessary and possible',
  );
  t.is(
    // @ts-expect-error Expected more arguments
    whereEndoEphemeralState('win32', {
      HOMEDRIVE: 'C:\\',
      HOMEPATH: 'Users\\Alice',
    }),
    'C:\\Users\\Alice\\AppData\\Local\\Temp\\Endo',
    'Infer LOCALAPPDATA from HOMEDRIVE and HOMEPATH if necessary and possible',
  );
  t.is(
    whereEndoEphemeralState(
      'win32',
      {},
      // @ts-expect-error Missing properties
      {
        home: 'C:\\Users\\Alice',
      },
    ),
    'C:\\Users\\Alice\\AppData\\Local\\Temp\\Endo',
    'Under duress, just use a relative path',
  );
});

test('darwin', t => {
  t.is(
    // @ts-expect-error Expected more arguments
    whereEndoEphemeralState('darwin', {
      XDG_RUNTIME_DIR: '/Users/alice/.run',
      XDG_STATE_HOME: 'IGNOREME',
      XDG_CONFIG_HOME: 'IGNOREME',
      HOME: 'IGNOREME',
    }),
    '/Users/alice/.run/endo',
    'Favor XDG state home over Darwin conventions if provided by the user',
  );
  t.is(
    whereEndoEphemeralState(
      'darwin',
      {
        HOME: 'IGNOREME',
      },
      // @ts-expect-error Missing properties
      {
        user: 'alice',
        temp: '/tmp/volumes/0',
      },
    ),
    '/tmp/volumes/0/endo-alice',
    'Use the system temporary location and user name',
  );
});

test('linux', t => {
  t.is(
    // @ts-expect-error Expected more arguments
    whereEndoEphemeralState('linux', {
      XDG_RUNTIME_DIR: '/Users/alice/.run',
      XDG_CONFIG_HOME: 'IGNOREME',
      XDG_STATE_HOME: 'IGNOREME',
      HOME: 'IGNOREME',
    }),
    '/Users/alice/.run/endo',
    'Use XDG state home if provided by the user',
  );
  t.is(
    whereEndoEphemeralState(
      'linux',
      {
        USER: 'alice',
        HOME: 'IGNOREME',
      },
      // @ts-expect-error Missing properties
      {
        temp: '/tmp/volume/0',
      },
    ),
    '/tmp/volume/0/endo-alice',
    'In the absence of XDG information, infer a temporary location from the USER if available',
  );
  t.is(
    whereEndoEphemeralState(
      'linux',
      {},
      // @ts-expect-error Missing properties
      {
        user: 'homer',
        temp: '/tmp/volume/0',
      },
    ),
    '/tmp/volume/0/endo-homer',
    'For lack of any useful environment information, fall back to a shared temporary directory',
  );
});
