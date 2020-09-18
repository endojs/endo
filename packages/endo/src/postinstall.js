// This postinstall hook creates mitm/node.
// This in turn interposes SES lockdown for all descendent processes, provided
// that the mitm directory is appears before Node.js's bin directory on the
// environment PATH.

import fs from "fs";

const node = process.argv[0];
const lockdown = new URL("./lockdown.cjs", import.meta.url).pathname;
const mitm = new URL("../mitm/node", import.meta.url).pathname;

const script = `#!/bin/bash
set -ueo pipefail
${node} -r ${lockdown} "$@"`;

fs.writeFileSync(mitm, script, "utf-8");
fs.chmodSync(mitm, 0o755);
