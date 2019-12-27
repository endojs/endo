import { test262Updater } from '@agoric/test262-runner';

test262Updater({ 
  testMatch: [
    'flags:\s*\[[^]]*module[^[]*]'
  ],
  testDirs: [
    '/test/language/import',
    '/test/language/export',
    '/test/language/module-code',
    '/test/language/expressions/dynamic-import',
  ],
});


