import test from 'ava';
import { exec } from 'child_process';
import { dirname, join } from 'path';

const cwd = join(
  dirname(new URL(import.meta.url).pathname),
  'console-error-trap',
);

test.cb('errors reveal their stacks', t => {
  t.plan(3);
  exec('node index.js', { cwd }, (err, stdout, stderr) => {
    t.assert(err, 'exit code should be non-zero');
    t.assert(
      stderr.includes('(Error#1)'),
      'stderr should have an error marker',
    );
    t.assert(
      stdout.includes('Error#1: Shibboleth'),
      'stdout should contain error message',
    );
    t.end();
  });
});
