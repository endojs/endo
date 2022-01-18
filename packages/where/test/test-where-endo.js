import test from 'ava';
import { whereEndo } from '../index.js';

test('windows', t => {
  t.is(
    whereEndo('win32', {
      LOCALAPPDATA: 'C:\\Users\\Alice\\AppData\\Local',
      APPDATA: 'C:\\Users\\Alice\\AppData',
      USERPROFILE: 'C:\\Users\\Alice',
      HOMEDRIVE: 'C:\\',
      HOMEPATH: 'Users\\Alice',
    }),
    'C:\\Users\\Alice\\AppData\\Local\\Endo',
  );
  t.is(
    whereEndo('win32', {
      APPDATA: 'C:\\Users\\Alice\\AppData',
      USERPROFILE: 'C:\\Users\\Alice',
      HOMEDRIVE: 'C:\\',
      HOMEPATH: 'Users\\Alice',
    }),
    'C:\\Users\\Alice\\AppData\\Endo',
  );
  t.is(
    whereEndo('win32', {
      USERPROFILE: 'C:\\Users\\Alice',
      HOMEDRIVE: 'C:\\',
      HOMEPATH: 'Users\\Alice',
    }),
    'C:\\Users\\Alice\\AppData\\Endo',
  );
  t.is(
    whereEndo('win32', {
      HOMEDRIVE: 'C:\\',
      HOMEPATH: 'Users\\Alice',
    }),
    'C:\\Users\\Alice\\AppData\\Endo',
  );
  t.is(whereEndo('win32', {}), '.');
});

test('darwin', t => {
  t.is(
    whereEndo('darwin', {
      HOME: '/Users/alice',
    }),
    '/Users/alice/Library/Application Support/Endo',
  );
  t.is(whereEndo('darwin', {}), 'endo');
});

test('linux', t => {
  t.is(
    whereEndo('linux', {
      XDG_CONFIG_DIR: '/Users/alice/.config2',
      HOME: '/Users/alice',
    }),
    '/Users/alice/.config2/endo',
  );
  t.is(
    whereEndo('linux', {
      HOME: '/Users/alice',
    }),
    '/Users/alice/.config/endo',
  );
  t.is(whereEndo('linux', {}), 'endo');
});
