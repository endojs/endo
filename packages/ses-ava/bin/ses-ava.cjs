#!/usr/bin/env node
(async () => {
  const { main } = await import('../src/command.js');
  await main(process.argv.slice(2));
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
