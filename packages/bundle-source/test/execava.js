// Creates a thin wrapper for running ava tests with shell commands.

import { $ } from 'execa';

export const execava =
  (t, execaOptions) =>
  (strings, ...values) => ({
    expect: async ({ stdout = undefined, stderr = '' } = {}) => {
      const result = await $(execaOptions)(strings, ...values);
      if (stdout !== undefined) {
        t.is(result.stdout, stdout);
      }
      if (typeof stderr === 'string') {
        t.is(result.stderr, stderr);
      } else {
        t.regex(result.stderr, stderr);
      }
    },
  });
