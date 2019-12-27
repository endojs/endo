import { test262Updater } from '@agoric/test262-runner';

test262Updater({ 
  testDirs: [
    '/test/built-ins/eval',
    '/test/built-ins/function',
    '/test/built-ins/global',
    '/test/language/eval-code',
  ]
});
