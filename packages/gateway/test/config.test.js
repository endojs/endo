// @ts-check

import '@endo/init/debug.js';

import test from 'ava';

import {
  DEFAULT_BIND_ADDRESS,
  defaultFeatureToggles,
  parseBindAddress,
  mergeGatewayConfig,
  bindAddressFromEnv,
} from '../index.js';

test('DEFAULT_BIND_ADDRESS is 0.0.0.0:8920', t => {
  // Regression: if the maintainer-pinned default ever drifts off
  // 0.0.0.0:8920 (named in the design's Bind Shape section), this
  // assertion fails. The Familiar variant overrides; the
  // system-service default must not.
  t.is(DEFAULT_BIND_ADDRESS, '0.0.0.0:8920');
});

test('parseBindAddress accepts IPv4 host:port', t => {
  const result = parseBindAddress('0.0.0.0:8920');
  t.deepEqual({ ...result }, { host: '0.0.0.0', port: 8920, kind: 'ipv4' });
});

test('parseBindAddress accepts hostname host:port', t => {
  const result = parseBindAddress('localhost:8920');
  t.deepEqual(
    { ...result },
    { host: 'localhost', port: 8920, kind: 'hostname' },
  );
});

test('parseBindAddress accepts bracketed IPv6', t => {
  const result = parseBindAddress('[::1]:8920');
  t.deepEqual({ ...result }, { host: '::1', port: 8920, kind: 'ipv6' });
});

test('parseBindAddress accepts the IPv6 unspecified address', t => {
  const result = parseBindAddress('[::]:8920');
  t.deepEqual({ ...result }, { host: '::', port: 8920, kind: 'ipv6' });
});

test('parseBindAddress keeps port 0 distinct from default', t => {
  // Regression for the project's recurring "port 0 is falsy"
  // pitfall (see `project/AGENTS.md` § Familiar). If the parser
  // collapses port 0 to a non-zero default, the OS-assigned port
  // request is lost.
  const result = parseBindAddress('127.0.0.1:0');
  t.is(result.port, 0);
  t.not(result.port, 8920);
});

test('parseBindAddress rejects an empty string', t => {
  t.throws(() => parseBindAddress(''), { message: /non-empty string/ });
});

test('parseBindAddress rejects an unbracketed bare IPv6', t => {
  // `::1:8920` is ambiguous; the parser must reject rather than
  // guess. If the parser ever silently accepts this shape and
  // assigns `port = 8920` while leaving `host = '::1'`, this
  // assertion fails.
  t.throws(() => parseBindAddress('::1:8920'), {
    message: /Bare IPv6 bind address is ambiguous/,
  });
});

test('parseBindAddress rejects an out-of-range port', t => {
  t.throws(() => parseBindAddress('0.0.0.0:65536'), {
    message: /port must be 0\.\.65535/,
  });
});

test('parseBindAddress rejects a non-numeric port', t => {
  t.throws(() => parseBindAddress('0.0.0.0:abc'), {
    message: /port must be numeric/,
  });
});

test('parseBindAddress rejects host without colon', t => {
  t.throws(() => parseBindAddress('localhost'), {
    message: /must include host:port/,
  });
});

test('parseBindAddress rejects IPv6 without closing bracket', t => {
  t.throws(() => parseBindAddress('[::1:8920'), {
    message: /missing closing bracket/,
  });
});

test('mergeGatewayConfig uses defaults when nothing is given', t => {
  const cfg = mergeGatewayConfig();
  t.is(cfg.bindAddress, DEFAULT_BIND_ADDRESS);
  t.deepEqual({ ...cfg.enableFeatures }, { ...defaultFeatureToggles });
  t.deepEqual([...cfg.trustedProxyCidrs], []);
});

test('mergeGatewayConfig overrides bind address', t => {
  const cfg = mergeGatewayConfig({ bindAddress: '127.0.0.1:0' });
  t.is(cfg.bindAddress, '127.0.0.1:0');
});

test('mergeGatewayConfig overrides individual feature toggles', t => {
  const cfg = mergeGatewayConfig({
    enableFeatures: { ...defaultFeatureToggles, gitHttp: false },
  });
  t.false(cfg.enableFeatures.gitHttp);
  // Other toggles should be preserved from the defaults.
  t.true(cfg.enableFeatures.virtualHosting);
  t.true(cfg.enableFeatures.ocapnWebSocket);
});

test('mergeGatewayConfig rejects relay without ocapnWebSocket', t => {
  // Per the design's Configuration Model § Dependencies between
  // features: relay depends on the WebSocket surface.
  t.throws(
    () =>
      mergeGatewayConfig({
        enableFeatures: {
          ...defaultFeatureToggles,
          captpRelay: true,
          ocapnWebSocket: false,
        },
      }),
    { message: /captpRelay depends on ocapnWebSocket/ },
  );
});

test('mergeGatewayConfig rejects relay without udsBootstrap', t => {
  t.throws(
    () =>
      mergeGatewayConfig({
        enableFeatures: {
          ...defaultFeatureToggles,
          captpRelay: true,
          udsBootstrap: false,
        },
      }),
    { message: /captpRelay depends on udsBootstrap/ },
  );
});

test('mergeGatewayConfig rejects adminDaemon without udsBootstrap', t => {
  t.throws(
    () =>
      mergeGatewayConfig({
        enableFeatures: {
          ...defaultFeatureToggles,
          adminDaemon: true,
          udsBootstrap: false,
        },
      }),
    { message: /adminDaemon depends on udsBootstrap/ },
  );
});

test('mergeGatewayConfig rejects chatHosting without virtualHosting', t => {
  t.throws(
    () =>
      mergeGatewayConfig({
        enableFeatures: {
          ...defaultFeatureToggles,
          chatHosting: true,
          virtualHosting: false,
        },
      }),
    { message: /chatHosting depends on virtualHosting/ },
  );
});

test('mergeGatewayConfig rejects a malformed bind address', t => {
  t.throws(() => mergeGatewayConfig({ bindAddress: 'not-a-bind' }), {
    message: /must include host:port|port must be numeric|port must be 0/,
  });
});

test('bindAddressFromEnv prefers ENDO_HTTP_ADDR', t => {
  t.is(
    bindAddressFromEnv({ ENDO_HTTP_ADDR: '127.0.0.1:0' }, '0.0.0.0:8920'),
    '127.0.0.1:0',
  );
});

test('bindAddressFromEnv falls back to configured value', t => {
  t.is(bindAddressFromEnv({}, '127.0.0.1:8920'), '127.0.0.1:8920');
});

test('bindAddressFromEnv falls back to default when nothing supplied', t => {
  t.is(bindAddressFromEnv({}), DEFAULT_BIND_ADDRESS);
});

test('bindAddressFromEnv ignores an empty ENDO_HTTP_ADDR', t => {
  // An exported-but-empty environment variable should be treated
  // as unset (a common shell mishap), not used as a literal empty
  // bind that would fail later.
  t.is(
    bindAddressFromEnv({ ENDO_HTTP_ADDR: '' }, '127.0.0.1:8920'),
    '127.0.0.1:8920',
  );
});
