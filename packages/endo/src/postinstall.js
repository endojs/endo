// This postinstall hook creates mitm/node.
// This in turn interposes SES lockdown for all descendent processes, provided
// that the mitm directory is appears before Node.js's bin directory on the
// environment PATH.

/* global process */

import fs from 'fs';
import { platform } from 'os';
import { fileURLToPath } from 'url';

const node = process.argv[0];
const lockdown = fileURLToPath(new URL('./lockdown.cjs', import.meta.url));
const mitm = fileURLToPath(
  new URL(
    `../mitm/node${platform() === 'win32' ? '.cmd' : ''}`,
    import.meta.url,
  ),
);

const nixScript = `#!/bin/bash
set -ueo pipefail
${node} -r ${lockdown} "$@"`;

const win32Script = `
@IF EXIST "%~dp0\\node.exe" (
    "%~dp0\\node.exe" -r ${lockdown} -r %*
) ELSE (
    @SETLOCAL
    @SET PATHEXT=%PATHEXT:;.JS;=;%
    node -r ${lockdown} %*
)
`;

fs.writeFileSync(
  mitm,
  platform() === 'win32' ? win32Script : nixScript,
  'utf-8',
);
fs.chmodSync(mitm, 0o755);
