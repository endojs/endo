// @ts-check

import test from '@endo/ses-ava/test.js';
import { Buffer } from 'buffer';

import {
  DEFAULT_TOR_VIRTUAL_PORT,
  buildAddOnionCommand,
  parseAddOnionReplyLines,
  buildSocks5ConnectRequest,
  parseSocks5ConnectReply,
  isV3OnionServiceId,
} from '../src/netlayers/tor.js';

// 56 base32 chars (a-z, 2-7): the v3 hidden service id length.
const VALID_V3_SERVICE_ID =
  'abcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqrstuvwx';

test('buildAddOnionCommand uses Goblins-compatible defaults', t => {
  const command = buildAddOnionCommand({
    targetSocketPath: '/tmp/ocapn-example.sock',
    virtualPort: DEFAULT_TOR_VIRTUAL_PORT,
  });
  t.is(
    command,
    'ADD_ONION NEW:ED25519-V3 PORT=9045,unix:/tmp/ocapn-example.sock',
  );
});

test('buildAddOnionCommand supports restored keys', t => {
  const command = buildAddOnionCommand({
    targetSocketPath: '/tmp/ocapn-example.sock',
    virtualPort: DEFAULT_TOR_VIRTUAL_PORT,
    privateKey: 'ED25519-V3:abcdef',
  });
  t.is(
    command,
    'ADD_ONION ED25519-V3:abcdef PORT=9045,unix:/tmp/ocapn-example.sock',
  );
});

test('parseAddOnionReplyLines extracts service id and private key', t => {
  const parsed = parseAddOnionReplyLines([
    '250-ServiceID=abcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqrstuvwxyz2345',
    '250-PrivateKey=ED25519-V3:secretkey',
    '250 OK',
  ]);
  t.is(
    parsed.serviceId,
    'abcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqrstuvwxyz2345',
  );
  t.is(parsed.privateKey, 'ED25519-V3:secretkey');
});

test('parseAddOnionReplyLines rejects missing service id', t => {
  const error = t.throws(
    () =>
      parseAddOnionReplyLines([
        '250-PrivateKey=ED25519-V3:secretkey',
        '250 OK',
      ]),
    { instanceOf: Error },
  );
  t.regex(error.message, /ServiceID/);
});

test('parseAddOnionReplyLines redacts PrivateKey from missing-id error', t => {
  const error = t.throws(
    () =>
      parseAddOnionReplyLines([
        '250-PrivateKey=ED25519-V3:supersecretkeyvalue',
        '250 OK',
      ]),
    { instanceOf: Error },
  );
  t.notRegex(
    error.message,
    /supersecretkeyvalue/,
    'private key value must not appear in error message',
  );
  t.regex(error.message, /\[REDACTED\]/);
});

test('isV3OnionServiceId accepts a 56-char base32 service id', t => {
  t.true(isV3OnionServiceId(VALID_V3_SERVICE_ID));
});

test('isV3OnionServiceId rejects invalid candidates', t => {
  // Wrong length
  t.false(isV3OnionServiceId('abc'));
  t.false(isV3OnionServiceId(`${VALID_V3_SERVICE_ID}a`));
  // Wrong alphabet (hex digits 8–9, uppercase, base64 specials)
  t.false(isV3OnionServiceId(VALID_V3_SERVICE_ID.replace('a', '8')));
  t.false(isV3OnionServiceId(VALID_V3_SERVICE_ID.toUpperCase()));
  t.false(isV3OnionServiceId(VALID_V3_SERVICE_ID.replace('a', '/')));
  // Trailing `.onion` hostname (a common would-be foot-gun)
  t.false(isV3OnionServiceId(`${VALID_V3_SERVICE_ID}.onion`));
  // Whitespace / control bytes
  t.false(isV3OnionServiceId(`${VALID_V3_SERVICE_ID.slice(0, -1)} `));
  t.false(isV3OnionServiceId(`\n${VALID_V3_SERVICE_ID.slice(1)}`));
  // Non-strings
  t.false(isV3OnionServiceId(undefined));
  t.false(isV3OnionServiceId(null));
  t.false(isV3OnionServiceId(123));
});

test('buildSocks5ConnectRequest encodes onion address and port', t => {
  const host = 'exampleexampleexampleexampleexampleexampleexampleexample.onion';
  const port = 9045;
  const request = buildSocks5ConnectRequest(host, port);

  t.is(request[0], 0x05); // version
  t.is(request[1], 0x01); // connect command
  t.is(request[2], 0x00); // reserved
  t.is(request[3], 0x03); // domain
  t.is(request[4], host.length); // host byte length
  t.is(request.toString('utf8', 5, 5 + host.length), host);
  t.is(request.readUInt16BE(5 + host.length), port);
});

test('parseSocks5ConnectReply accepts IPv4 reply', t => {
  const reply = Buffer.from([
    0x05, // version
    0x00, // success
    0x00, // reserved
    0x01, // atyp ipv4
    127,
    0,
    0,
    1, // bound address
    0x23,
    0x55, // bound port 9045
  ]);
  t.is(parseSocks5ConnectReply(reply), reply.length);
});

test('parseSocks5ConnectReply waits for complete domain reply', t => {
  const partial = Buffer.from([0x05, 0x00, 0x00, 0x03, 10]);
  t.is(parseSocks5ConnectReply(partial), undefined);
});

test('parseSocks5ConnectReply rejects failure status', t => {
  const failureReply = Buffer.from([
    0x05, // version
    0x05, // connection refused
    0x00, // reserved
    0x01, // atyp ipv4
    127,
    0,
    0,
    1,
    0x23,
    0x55,
  ]);
  const error = t.throws(() => parseSocks5ConnectReply(failureReply), {
    instanceOf: Error,
  });
  t.regex(error.message, /connection refused/i);
  // The reply code is exposed on the thrown error so the netlayer can
  // distinguish transient reply codes (worth retrying, e.g. 0x06 TTL
  // expired) from permanent ones (e.g. 0x05 connection refused).
  t.is(/** @type {{socksReplyCode?: number}} */ (error).socksReplyCode, 0x05);
});

test('parseSocks5ConnectReply tags TTL-expired replies for retry', t => {
  // Tor returns 0x06 (TTL expired) when its hidden-service descriptor
  // fetch budget is exhausted before any HSDir replies. This is the
  // canonical transient failure that the netlayer should retry on.
  const ttlExpiredReply = Buffer.from([
    0x05, // version
    0x06, // TTL expired
    0x00, // reserved
    0x01, // atyp ipv4
    0,
    0,
    0,
    0,
    0,
    0,
  ]);
  const error = t.throws(() => parseSocks5ConnectReply(ttlExpiredReply), {
    instanceOf: Error,
  });
  t.regex(error.message, /TTL expired/i);
  t.is(/** @type {{socksReplyCode?: number}} */ (error).socksReplyCode, 0x06);
});
