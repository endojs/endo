import test from 'ava';
import { whereEndoLog } from '../index.js';

test('windows', t => {
  t.is(
    whereEndoLog('win32', {
      LOCALAPPDATA: 'C:\\Users\\Alice\\AppData\\Local',
      APPDATA: 'C:\\Users\\Alice\\AppData',
      USERPROFILE: 'C:\\Users\\Alice',
      HOMEDRIVE: 'C:\\',
      HOMEPATH: 'Users\\Alice',
    }),
    'C:\\Users\\Alice\\AppData\\Local\\Endo\\endo.log',
  );
  t.is(
    whereEndoLog('win32', {
      APPDATA: 'C:\\Users\\Alice\\AppData',
      USERPROFILE: 'C:\\Users\\Alice',
      HOMEDRIVE: 'C:\\',
      HOMEPATH: 'Users\\Alice',
    }),
    'C:\\Users\\Alice\\AppData\\Endo\\endo.log',
  );
  t.is(
    whereEndoLog('win32', {
      USERPROFILE: 'C:\\Users\\Alice',
      HOMEDRIVE: 'C:\\',
      HOMEPATH: 'Users\\Alice',
    }),
    'C:\\Users\\Alice\\AppData\\Endo\\endo.log',
  );
  t.is(
    whereEndoLog('win32', {
      HOMEDRIVE: 'C:\\',
      HOMEPATH: 'Users\\Alice',
    }),
    'C:\\Users\\Alice\\AppData\\Endo\\endo.log',
  );
  t.is(whereEndoLog('win32', {}), '.\\endo.log');
});

test('darwin', t => {
  t.is(
    whereEndoLog('darwin', {
      HOME: '/Users/alice',
    }),
    '/Users/alice/Library/Caches/Endo/endo.log',
  );
  t.is(whereEndoLog('darwin', {}), 'endo.log');
});

test('linux', t => {
  t.is(
    whereEndoLog('linux', {
      XDG_CACHE_HOME: '/var/cache/users/alice',
      USER: 'alice',
      HOME: '/Users/alice',
    }),
    '/var/cache/users/alice/endo/endo.log',
  );
  t.is(
    whereEndoLog('linux', {
      USER: 'alice',
      HOME: '/Users/alice',
    }),
    '/Users/alice/.cache/endo/endo.log',
  );
  t.is(whereEndoLog('linux', {}), 'endo.log');
});
