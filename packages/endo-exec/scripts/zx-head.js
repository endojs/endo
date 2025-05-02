#! /usr/bin/env endo-exec
import 'zx/globals';

/** @type {import('endo-exec').Main} */
export const main = async ({
  process: {
    argv: [script, file],
  },
}) => {
  echo`Hello, world (from ${script})!`;
  await $`head -5 ${file}`;
};
