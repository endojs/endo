#!/usr/bin/env node
(async () => {
  const { main } = await import('../src/command.js');
  return main(process.argv.slice(2));
})().then(
  exitCode => {
    process.exitCode ||= exitCode;
  },
  error => {
    console.error(error);
    process.exitCode ||= 1;
  },
);
