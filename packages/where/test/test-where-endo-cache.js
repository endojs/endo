import test from 'ava';
import { whereEndoCache } from '../index.js';

test('windows', t => {
  t.is(
    whereEndoCache('win32', {
      LOCALAPPDATA: 'C:\\Users\\Alice\\AppData\\Local',
      APPDATA: 'C:\\Users\\Alice\\AppData',
      USERPROFILE: 'C:\\Users\\Alice',
      HOMEDRIVE: 'C:\\',
      HOMEPATH: 'Users\\Alice',
    }),
    'C:\\Users\\Alice\\AppData\\Local\\Endo',
  );
  t.is(
    whereEndoCache('win32', {
      APPDATA: 'C:\\Users\\Alice\\AppData',
      USERPROFILE: 'C:\\Users\\Alice',
      HOMEDRIVE: 'C:\\',
      HOMEPATH: 'Users\\Alice',
    }),
    'C:\\Users\\Alice\\AppData\\Endo',
  );
  t.is(
    whereEndoCache('win32', {
      USERPROFILE: 'C:\\Users\\Alice',
      HOMEDRIVE: 'C:\\',
      HOMEPATH: 'Users\\Alice',
    }),
    'C:\\Users\\Alice\\AppData\\Endo',
  );
  t.is(
    whereEndoCache('win32', {
      HOMEDRIVE: 'C:\\',
      HOMEPATH: 'Users\\Alice',
    }),
    'C:\\Users\\Alice\\AppData\\Endo',
  );
  t.is(whereEndoCache('win32', {}), 'Endo');
});

test('darwin', t => {
  t.is(
    whereEndoCache('darwin', {
      HOME: '/Users/alice',
    }),
    '/Users/alice/Library/Caches/Endo',
  );
  t.is(whereEndoCache('darwin', {}), 'endo/cache');
});

test('linux', t => {
  t.is(
    whereEndoCache('linux', {
      XDG_CACHE_HOME: '/var/cache/users/alice',
      USER: 'alice',
      HOME: '/Users/alice',
    }),
    '/var/cache/users/alice/endo',
  );
  t.is(
    whereEndoCache('linux', {
      USER: 'alice',
      HOME: '/Users/alice',
    }),
    '/Users/alice/.cache/endo',
  );
  t.is(whereEndoCache('linux', {}), 'endo/cache');
});
