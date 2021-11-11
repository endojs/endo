import test from 'ava';
import { exec } from 'child_process';
import { dirname, join } from 'path';

const cwd = join(
  dirname(new URL(import.meta.url).pathname),
  'console-error-trap',
);

const exitAssertions = (t, expectedCode, altExpectedCode = expectedCode) => {
  return (err, stdout, stderr) => {
    t.log({ stdout, stderr });
    t.assert(
      err.code === expectedCode || err.code === altExpectedCode,
      'exit error code',
    );
    t.assert(
      stderr.includes('(Error#1)'),
      'stderr should have an error marker',
    );
    t.assert(
      !stderr.includes('(Error#2)'),
      'stderr should not have a second error marker',
    );
    t.assert(
      stdout.includes('Error#1: Shibboleth'),
      'stdout should contain error message',
    );
    t.assert(
      !stdout.includes('Error#2: I am once again throwing an error'),
      'stdout should contain second error message',
    );
    t.end();
  };
};

test.cb('errors reveal their stacks', t => {
  t.plan(5);
  exec('node default.js', { cwd }, exitAssertions(t, 255));
});

test.cb('errors reveal their stacks with errorTrapping: platform', t => {
  t.plan(5);
  exec('node platform.js', { cwd }, exitAssertions(t, 255));
});

test.cb('errors reveal their stacks with errorTrapping: exit', t => {
  t.plan(5);
  exec('node exit.js', { cwd }, exitAssertions(t, 255));
});

test.cb('errors reveal their stacks with errorTrapping: exit with code', t => {
  t.plan(5);
  exec('node exit-code.js', { cwd }, exitAssertions(t, 127));
});

test.cb('errors reveal their stacks with errorTrapping: abort', t => {
  t.plan(5);
  // Mac exits with null, Linux exits with code 134
  exec('node abort.js', { cwd }, exitAssertions(t, null, 134));
});

test.cb('errors reveal their stacks with errorTrapping: report', t => {
  t.plan(5);
  exec('node report.js', { cwd }, (err, stdout, stderr) => {
    t.log({ stdout, stderr });
    t.is(err, null);
    t.assert(
      stderr.includes('(Error#1)'),
      'stderr should have an error marker',
    );
    t.assert(
      stderr.includes('(Error#2)'),
      'stderr should have a second error marker',
    );
    t.assert(
      stdout.includes('Error#1: Shibboleth'),
      'stdout should contain error message',
    );
    t.assert(
      stdout.includes('Error#2: I am once again'),
      'stdout should contain second error message',
    );
    t.end();
  });
});
