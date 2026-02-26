// @ts-check

/**
 * Exfiltration defense for the Familiar Electron shell.
 *
 * Applies multiple defense layers to prevent data exfiltration from weblet
 * iframes served on `localhttp://` origins:
 *
 * - Layer 2: Electron request interception (blocks non-localhttp requests from
 *   localhttp origins)
 * - Layer 3: DNS poisoning (invalid DoH config + host-resolver-rules)
 * - Layer 5: WebRTC disabled (command-line flags + permission handler)
 *
 * Layers 1 (CSP) and 4 (navigation delegate) are handled by
 * protocol-handler.js and navigation-guard.js respectively.
 * Layer 6 (iframe sandbox) is applied by Chat when creating weblet iframes.
 */

import dns from 'dns';
// @ts-ignore Electron is not typed in this project
import { app, session } from 'electron';

/**
 * Configure command-line flags that must be set before app is ready.
 * Call this as early as possible in the main process.
 */
const configureCommandLineFlags = () => {
  // Disable DNS prefetching and WebRTC features
  app.commandLine.appendSwitch(
    'disable-features',
    'DnsOverHttpsUpgrade,AsyncDns,WebRtcHideLocalIpsWithMdns',
  );

  // Disable hyperlink auditing (<a ping="...">)
  app.commandLine.appendSwitch('no-pings');

  // Map all hostnames to NOTFOUND, except literal IPs which bypass the
  // resolver. This is the definitive DNS exfiltration block.
  app.commandLine.appendSwitch(
    'host-resolver-rules',
    'MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
  );

  // Disable non-proxied UDP for WebRTC (prevents STUN/TURN exfiltration)
  app.commandLine.appendSwitch(
    'force-webrtc-ip-handling-policy',
    'disable_non_proxied_udp',
  );
};


/**
 * Configure DNS poisoning via invalid DoH endpoint. Must be called after
 * `app.whenReady()`.
 *
 * In `secure` mode, Chromium only uses the configured DoH servers and will
 * not fall back to the system DNS resolver. Since the endpoint is
 * unreachable, all DNS resolution fails. Literal IP addresses (127.0.0.1)
 * bypass DNS entirely.
 */
const configureDnsPoisoning = () => {
  app.configureHostResolver({
    secureDnsMode: 'secure',
    secureDnsServers: ['https://invalid.localhost/dns-query'],
  });
};

/**
 * Install request interception that blocks any request from a `localhttp://`
 * origin that targets an external URL. Must be called after
 * `app.whenReady()`.
 */
const installRequestInterception = () => {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const requestUrl = new URL(details.url);
    const initiator = details.referrer || details.url;

    // Allow all requests from non-localhttp origins (Chat itself).
    if (!initiator.startsWith('localhttp://')) {
      callback({ cancel: false });
      return;
    }

    // Allow requests to the localhttp scheme (handled by protocol handler).
    if (requestUrl.protocol === 'localhttp:') {
      callback({ cancel: false });
      return;
    }

    // Block everything else from localhttp origins.
    console.warn(
      `[Security] Blocked request from ${initiator} to ${details.url}`,
    );
    callback({ cancel: true });
  });
};

/**
 * Install a permission request handler that denies all permissions from
 * `localhttp://` origins. This blocks WebRTC, camera/mic, geolocation, etc.
 * Must be called after `app.whenReady()`.
 */
const installPermissionHandler = () => {
  session.defaultSession.setPermissionRequestHandler(
    (webContents, _permission, callback) => {
      const url = webContents.getURL();
      if (url.startsWith('localhttp://')) {
        callback(false);
        return;
      }
      callback(true);
    },
  );
};

/**
 * Verify that exfiltration defenses are functioning. Returns an array of
 * warning strings for any defense layer that cannot be confirmed.
 *
 * @returns {Promise<string[]>}
 */
const verifyExfiltrationDefenses = async () => {
  /** @type {string[]} */
  const warnings = [];

  await null;

  // Verify DNS poisoning is active by attempting a resolution.
  // dns.resolve uses the Node.js resolver (not Chromium's), so this tests
  // the system-level DNS but serves as a canary for the overall approach.
  try {
    await dns.promises.resolve('canary.exfiltration-test.invalid');
    // Resolution succeeded unexpectedly — DNS is leaking.
    warnings.push(
      'DNS resolution succeeded unexpectedly. ' +
        'DNS-based exfiltration may be possible.',
    );
  } catch {
    // Expected: resolution should fail for .invalid TLD.
  }

  // Verify host-resolver-rules flag was accepted.
  if (!app.commandLine.hasSwitch('host-resolver-rules')) {
    warnings.push(
      'host-resolver-rules flag not set. ' +
        'DNS prefetch may not be fully blocked.',
    );
  }

  return warnings;
};

/**
 * Install all post-ready exfiltration defenses. Must be called after
 * `app.whenReady()`.
 */
const installExfiltrationDefenses = () => {
  configureDnsPoisoning();
  installRequestInterception();
  installPermissionHandler();
};

export {
  configureCommandLineFlags,
  installExfiltrationDefenses,
  verifyExfiltrationDefenses,
};
