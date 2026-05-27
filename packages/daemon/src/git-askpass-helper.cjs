#!/usr/bin/env node
/* eslint-disable no-restricted-globals, no-undef */
// @ts-nocheck

'use strict';

// Daemon-shipped GIT_ASKPASS helper. Native git invokes this program once per
// credential prompt. The daemon writes newline-delimited credential responses
// to an anonymous pipe inherited by git as ENDO_GIT_ASKPASS_FD.

const fs = require('fs');

const fdRaw = process.env.ENDO_GIT_ASKPASS_FD;
if (fdRaw === undefined || fdRaw === '') {
  process.exit(1);
}

const fd = Number.parseInt(fdRaw, 10);
if (!Number.isInteger(fd) || fd < 3) {
  process.exit(1);
}

const oneByte = Buffer.alloc(1);
let line = '';
for (;;) {
  let size;
  try {
    size = fs.readSync(fd, oneByte, 0, 1, null);
  } catch {
    process.exit(1);
  }
  if (size === 0) {
    break;
  }
  const byte = oneByte[0];
  if (byte === 0x0a) {
    break;
  }
  line += String.fromCharCode(byte);
}

process.stdout.write(line);
