#!/usr/bin/env node

const { spawnSync } = require('child_process');

console.log(`running 'yarn workspaces info' to check for mismatched dependencies`);
const s = spawnSync('yarn', ['--silent', 'workspaces', 'info'], {
  stdio: ['ignore', 'pipe', 'inherit']
});
if (s.status !== 0) {
  console.log(`error running 'yarn workspaces info':`);
  console.log(s.status);
  console.log(s.signal);
  console.log(s.error);
  console.log(s.stdout);
  console.log(s.stderr);
  process.exit(1);
}

const d = JSON.parse(s.stdout);
for (const pkgname of Object.getOwnPropertyNames(d)) {
  const md = d[pkgname].mismatchedWorkspaceDependencies;
  if (md.length) {
    console.log(`package '${pkgname}' has mismatched dependencies on: ${md}`);
    process.exitCode = 1;
  }
}
