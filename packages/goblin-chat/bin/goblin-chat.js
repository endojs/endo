#!/usr/bin/env node
// @ts-check

/**
 * Thin shebang shim. The TUI itself lives in the package's `index.js`
 * so `node packages/goblin-chat/index.js` works directly; this script
 * exists only so that the npm `bin` entry can launch it via `PATH`.
 */

import '../index.js';
