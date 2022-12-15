import test from 'ava';
import { whereEndoCache } from '../index.js';

test('windows', t => {
  t.is(
    whereEndoCache('win32', {
      LOCALAPPDATA: 'C:\\Users\\Alice\\AppData\\Local',
      APPDATA: 'IGNOREME',
      USERPROFILE: 'IGNOREME',
      HOMEDRIVE: 'IGNOREME',
      HOMEPATH: 'IGNOREME',
    }),
    'C:\\Users\\Alice\\AppData\\Local\\Endo',
    'LOCALAPPDATA has highest precedence for locating the Endo cache on Windows.',
  );
  t.is(
    whereEndoCache('win32', {
      APPDATA: 'C:\\Users\\Alice\\AppData',
      USERPROFILE: 'IGNOREME',
      HOMEDRIVE: 'IGNOREME',
      HOMEPATH: 'IGNOREME',
    }),
    'C:\\Users\\Alice\\AppData\\Local\\Endo',
    'Infer LOCALAPPDATA from APPDATA',
  );
  t.is(
    whereEndoCache('win32', {
      USERPROFILE: 'C:\\Users\\Alice',
      HOMEDRIVE: 'C:\\',
      HOMEPATH: 'Users\\Alice',
    }),
    'C:\\Users\\Alice\\AppData\\Local\\Endo',
    'Infer LOCALAPPDATA from USERPROFILE',
  );
  t.is(
    whereEndoCache('win32', {
      HOMEDRIVE: 'C:\\',
      HOMEPATH: 'Users\\Alice',
    }),
    'C:\\Users\\Alice\\AppData\\Local\\Endo',
    'Infer LOCALAPPDATA from HOMEDRIVE and HOMEPATH',
  );
  t.is(
    whereEndoCache('win32', {}),
    'Endo',
    'Under duress, fall back to a relative path, just Endo',
  );
});

test('darwin', t => {
  t.is(
    whereEndoCache('darwin', {
      XDG_CACHE_HOME: '/Users/alice/.config',
      HOME: 'IGNOREME',
    }),
    '/Users/alice/.config/endo',
    'Prioritize XDG environment if provided, even on a Mac',
  );
  t.is(
    whereEndoCache('darwin', {
      HOME: '/Users/alice',
    }),
    '/Users/alice/Library/Caches/Endo',
    'In absence of XDG environment, use conventional Mac cache location',
  );
  t.is(
    whereEndoCache('darwin', {}),
    'endo/cache',
    'Under duress, fall back to a relative path, just endo/cache',
  );
});

test('linux', t => {
  t.is(
    whereEndoCache('linux', {
      XDG_CACHE_HOME: '/var/cache/users/alice',
      USER: 'IGNOREME',
      HOME: 'IGNOREME',
    }),
    '/var/cache/users/alice/endo',
    'Prioritize XDG environment location for caches',
  );
  t.is(
    whereEndoCache('linux', {
      USER: 'IGNOREME',
      HOME: '/Users/alice',
    }),
    '/Users/alice/.cache/endo',
    'Infer the conventional XDG environment from the user HOME',
  );
  t.is(
    whereEndoCache('linux', {
      USER: 'IGNOREME',
    }),
    'endo/cache',
    'Under duress, do not attempt to infer whether /users/ or /home/ is a correct USER prefix for HOME, fall through to a relative path',
  );
});
