#!/usr/bin/env node
(async () => {
  const fs = await import('fs');
  const { main } = await import('../src/cli.js');
  main(process, { fs: fs.promises });
})();
