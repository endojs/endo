#!/usr/bin/env node
/* eslint-disable no-restricted-globals, no-undef */
// @ts-nocheck

'use strict';

// Daemon-shipped GIT_ASKPASS helper. Native git invokes this program once per
// credential prompt, passing the prompt text (e.g. "Username for 'https://...'"
// or "Password for 'https://...'") as argv[2]. The daemon writes role-tagged,
// length-prefixed credential records to an anonymous pipe inherited by git as
// ENDO_GIT_ASKPASS_FD. Git invokes this helper once per prompt, and every
// invocation inherits the SAME pipe, so the helper must consume exactly the
// records it needs and leave the rest for the next invocation.
//
// Each invocation reads records (role-byte, then 4-byte big-endian length, then
// that many value bytes) until it finds one whose role matches the prompt, and
// writes that record's value. Records whose role does not match the prompt are
// discarded as they are read. Selecting by prompt — and skipping ahead past a
// non-matching record — is required because git omits the username prompt when
// the remote URL already embeds a username; a positional first-record-wins
// reader would then hand the username bytes to the password prompt.

const fs = require('fs');

// Role tags. One byte each. Mirrors ROLE_USERNAME / ROLE_PASSWORD in
// native-git-backend.js's credential encoder.
const ROLE_USERNAME = 0x55; // 'U'
const ROLE_PASSWORD = 0x50; // 'P'

const fdRaw = process.env.ENDO_GIT_ASKPASS_FD;
if (fdRaw === undefined || fdRaw === '') {
  process.exit(1);
}

const fd = Number.parseInt(fdRaw, 10);
if (!Number.isInteger(fd) || fd < 3) {
  process.exit(1);
}

/**
 * Read exactly `length` bytes from the inherited pipe. Blocks across short
 * reads. Exits the process on EOF-before-length or read error.
 *
 * @param {number} length
 * @returns {Buffer}
 */
const readExactly = length => {
  const out = Buffer.alloc(length);
  let filled = 0;
  while (filled < length) {
    let size;
    try {
      size = fs.readSync(fd, out, filled, length - filled, null);
    } catch {
      process.exit(1);
    }
    if (size === 0) {
      // Pipe closed before the record was complete.
      process.exit(1);
    }
    filled += size;
  }
  return out;
};

// Select by prompt. Git's prompts are "Username for '<url>'" and
// "Password for '<url>'". Default to the password record for an unrecognized
// prompt: git only asks for a username when it has decided it needs one, so an
// unexpected prompt is far likelier to be a password request.
const prompt = (process.argv[2] || '').toLowerCase();
const wantedRole = prompt.includes('username') ? ROLE_USERNAME : ROLE_PASSWORD;

// Read records one at a time, discarding any whose role does not match, until
// the wanted record is found. Leaves any later records in the pipe for the next
// helper invocation.
for (;;) {
  const header = readExactly(5);
  const role = header[0];
  const length = header.readUInt32BE(1);
  const value = readExactly(length);
  if (role === wantedRole) {
    // Write the credential bytes through verbatim. This is an opaque
    // secret-transport shim: it must not interpret the credential as JS text.
    // Decoding to a string and re-encoding corrupts non-ASCII (and non-UTF-8)
    // credentials.
    fs.writeSync(1, value);
    break;
  }
  // Role mismatch: discard this record and read the next one.
}
