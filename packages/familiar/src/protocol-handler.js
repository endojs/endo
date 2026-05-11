// @ts-check
/* global globalThis */

/**
 * `localhttp://` custom protocol handler for Electron.
 *
 * Registers a privileged scheme that gives each weblet a unique origin
 * (`localhttp://<weblet-id>/`) and proxies HTTP-like traffic to the daemon's
 * gateway on 127.0.0.1. A Content-Security-Policy header is injected on every
 * response to confine weblet network access to its own origin.
 */

// @ts-ignore Electron is not typed in this project
import { protocol } from 'electron';

/**
 * CSP directives injected on every `localhttp://` response.
 *
 * - `script-src 'unsafe-eval'`: required for SES lockdown's eval-based loader.
 * - `connect-src 'self'`: restricts fetch/XHR/WebSocket/EventSource to own origin.
 * - `object-src 'none'`: blocks plugins.
 * - `form-action 'self'`: prevents form submissions to external URLs.
 */
const cspDirectives = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

/**
 * Register `localhttp` as a privileged scheme. Must be called before
 * `app.whenReady()`.
 */
const registerLocalhttpScheme = () => {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'localhttp',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
      },
    },
  ]);
};

/**
 * Install the `localhttp://` protocol handler. Must be called after
 * `app.whenReady()`.
 *
 * @param {number} gatewayPort - The daemon gateway port (e.g. 8920).
 */
const installLocalhttpHandler = gatewayPort => {
  protocol.handle('localhttp', async request => {
    const url = new URL(request.url);
    const webletId = url.hostname;
    const pathAndQuery = url.pathname + url.search;

    // Proxy to the daemon's unified gateway server.
    const target = `http://127.0.0.1:${gatewayPort}${pathAndQuery}`;
    const proxyResponse = await globalThis.fetch(target, {
      method: request.method,
      headers: {
        ...Object.fromEntries(request.headers.entries()),
        Host: webletId,
      },
      body: request.body,
    });

    // Inject Content-Security-Policy on every response.
    const headers = new Headers(proxyResponse.headers);
    headers.set('Content-Security-Policy', cspDirectives);

    return new Response(proxyResponse.body, {
      status: proxyResponse.status,
      statusText: proxyResponse.statusText,
      headers,
    });
  });
};

export { registerLocalhttpScheme, installLocalhttpHandler };
