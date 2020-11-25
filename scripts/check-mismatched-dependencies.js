#! /usr/bin/env node

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

let good = true;
const d = JSON.parse(s.stdout);
for (const pkgname of Object.getOwnPropertyNames(d)) {
  const md = d[pkgname].mismatchedWorkspaceDependencies;
  if (md.length) {
    console.log(`package '${pkgname}' has mismatched dependencies on: ${md}`);
    good = false;
  }
}
if (good) {
  console.log('looks good');
  process.exit(0);
} else {
  process.exit(1);
}

