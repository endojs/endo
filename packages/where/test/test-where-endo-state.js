import test from 'ava';
import { whereEndoState } from '../index.js';

test('windows', t => {
  t.is(
    whereEndoState('win32', {
      LOCALAPPDATA: 'C:\\Users\\Alice\\AppData\\Local',
      APPDATA: 'C:\\Users\\Alice\\AppData',
      USERPROFILE: 'C:\\Users\\Alice',
      HOMEDRIVE: 'C:\\',
      HOMEPATH: 'Users\\Alice',
    }),
    'C:\\Users\\Alice\\AppData\\Local\\Endo',
  );
  t.is(
    whereEndoState('win32', {
      APPDATA: 'C:\\Users\\Alice\\AppData',
      USERPROFILE: 'C:\\Users\\Alice',
      HOMEDRIVE: 'C:\\',
      HOMEPATH: 'Users\\Alice',
    }),
    'C:\\Users\\Alice\\AppData\\Endo',
  );
  t.is(
    whereEndoState('win32', {
      USERPROFILE: 'C:\\Users\\Alice',
      HOMEDRIVE: 'C:\\',
      HOMEPATH: 'Users\\Alice',
    }),
    'C:\\Users\\Alice\\AppData\\Endo',
  );
  t.is(
    whereEndoState('win32', {
      HOMEDRIVE: 'C:\\',
      HOMEPATH: 'Users\\Alice',
    }),
    'C:\\Users\\Alice\\AppData\\Endo',
  );
  t.is(whereEndoState('win32', {}), 'Endo');
});

test('darwin', t => {
  t.is(
    whereEndoState('darwin', {
      HOME: '/Users/alice',
    }),
    '/Users/alice/Library/Application Support/Endo',
  );
  t.is(whereEndoState('darwin', {}), 'endo/state');
});

test('linux', t => {
  t.is(
    whereEndoState('linux', {
      XDG_CONFIG_HOME: '/Users/alice/.config2',
      XDG_STATE_HOME: '/Users/alice/.local/state',
      HOME: '/Users/alice',
    }),
    '/Users/alice/.local/state/endo',
  );
  t.is(
    whereEndoState('linux', {
      HOME: '/Users/alice',
    }),
    '/Users/alice/.local/state/endo',
  );
  t.is(whereEndoState('linux', {}), 'endo/state');
});
