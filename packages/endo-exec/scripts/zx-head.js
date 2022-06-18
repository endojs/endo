#! /usr/bin/env endo-exec
import 'zx/globals';

export const main = async ({ argv: [script, file] }) => {
  echo`Hello, world (from ${script})!`;
  await $`head -5 ${file}`;
};
