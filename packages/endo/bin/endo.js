#!/usr/bin/env node
/* global process */
(async () => {
  const fs = await import('fs');
  const { main } = await import('../src/cli.js');
  main(process, { fs: fs.promises });
})();
