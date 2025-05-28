import test from 'ava';
import { whereEndoCache } from '../index.js';

test('windows', t => {
  t.is(
    // @ts-expect-error Expected more arguments
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
    // @ts-expect-error Expected more arguments
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
    // @ts-expect-error Expected more arguments
    whereEndoCache('win32', {
      USERPROFILE: 'C:\\Users\\Alice',
      HOMEDRIVE: 'C:\\',
      HOMEPATH: 'Users\\Alice',
    }),
    'C:\\Users\\Alice\\AppData\\Local\\Endo',
    'Infer LOCALAPPDATA from USERPROFILE',
  );
  t.is(
    // @ts-expect-error Expected more arguments
    whereEndoCache('win32', {
      HOMEDRIVE: 'C:\\',
      HOMEPATH: 'Users\\Alice',
    }),
    'C:\\Users\\Alice\\AppData\\Local\\Endo',
    'Infer LOCALAPPDATA from HOMEDRIVE and HOMEPATH',
  );
  t.is(
    whereEndoCache(
      'win32',
      {},
      {
        home: 'C:\\Users\\Alice',
      },
    ),
    'C:\\Users\\Alice\\AppData\\Local\\Endo',
    'Fall through to system-provided home',
  );
});

test('darwin', t => {
  t.is(
    // @ts-expect-error Expected more arguments
    whereEndoCache('darwin', {
      XDG_CACHE_HOME: '/Users/alice/.config',
      HOME: 'IGNOREME',
    }),
    '/Users/alice/.config/endo',
    'Prioritize XDG environment if provided, even on a Mac',
  );
  t.is(
    // @ts-expect-error Expected more arguments
    whereEndoCache('darwin', {
      HOME: '/Users/alice',
    }),
    '/Users/alice/Library/Caches/Endo',
    'In absence of XDG environment, use conventional Mac cache location',
  );
  t.is(
    whereEndoCache(
      'darwin',
      {},
      {
        home: '/Users/homer',
      },
    ),
    '/Users/homer/Library/Caches/Endo',
    'Fall back to system provided home',
  );
});

test('linux', t => {
  t.is(
    // @ts-expect-error Expected more arguments
    whereEndoCache('linux', {
      XDG_CACHE_HOME: '/var/cache/users/alice',
      USER: 'IGNOREME',
      HOME: 'IGNOREME',
    }),
    '/var/cache/users/alice/endo',
    'Prioritize XDG environment location for caches',
  );
  t.is(
    // @ts-expect-error Expected more arguments
    whereEndoCache('linux', {
      USER: 'IGNOREME',
      HOME: '/Users/alice',
    }),
    '/Users/alice/.cache/endo',
    'Infer the conventional XDG environment from the user HOME',
  );
  t.is(
    whereEndoCache(
      'linux',
      {
        USER: 'IGNOREME',
      },
      {
        home: '/home/homer',
      },
    ),
    '/home/homer/.cache/endo',
    'Under duress, do not attempt to infer whether /users/ or /home/ is a correct USER prefix for HOME, fall through to a relative path',
  );
});
