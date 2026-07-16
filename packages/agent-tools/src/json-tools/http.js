// @ts-check
/// <reference types="ses"/>

/** @import { ERef } from '@endo/eventual-send' */
/** @import { InterfaceGuard, Pattern } from '@endo/patterns' */
/** @import { HttpToolCapability, HttpResponseView, ToolRecord } from '../types.js' */

/** @typedef {Record<keyof HttpToolCapability, (...args: unknown[]) => Promise<unknown>>} HttpToolDispatch */

import { E } from '@endo/eventual-send';
import {
  getInterfaceGuardPayload,
  getMethodGuardPayload,
} from '@endo/patterns';
import { HttpClientInterface } from '@endo/exo-http-client';

import { makeTool } from '../tool.js';

/**
 * JSON Schemas for the `HttpClient` methods exposed as agent tools.
 * Hand-authored and pinned against `HttpClientInterface` on the *input* side by
 * the divergence gate (`test/http-tool.test.js`).
 *
 * The `fetch` tool deliberately diverges from the raw guard on the *output*
 * side: `HttpClient.fetch` returns a live `HttpResponse` remotable
 * (`M.remotable()`), which cannot cross the JSON tool wire, so the tool's
 * `execute` projects it to a JSON-safe record (status/headers/body). This is
 * the same wire↔cap divergence `makeGitMountTools` spans for `status`; only the
 * input args are guard-pinned.
 *
 * @type {Record<keyof HttpToolCapability, { description: string, parameters: object }>}
 */
const httpToolSchemas = harden({
  fetch: {
    description:
      'Make a single confined outbound HTTP request. The origin must be in ' +
      'the client allowlist; the request is rate-limited, redirect-contained, ' +
      'and the response body is capped and may be truncated. Returns ' +
      '{ status, statusText, ok, url, headers, truncated, body } where body is ' +
      'the decoded text (parse it yourself if the content is JSON); a non-2xx ' +
      'status is data, not an error.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description:
            'The absolute request URL. Its origin (scheme://host:port) must ' +
            'be an exact member of the client allowlist.',
        },
        options: {
          // Open object (no `additionalProperties: false`) to match the
          // runtime guard `FetchOptionsShape` — an `M.splitRecord` whose
          // optional part admits unlisted keys. The divergence gate pins the
          // two together.
          type: 'object',
          properties: {
            method: {
              type: 'string',
              description:
                'HTTP method (GET, HEAD, POST, PUT, DELETE, OPTIONS, PATCH); ' +
                'defaults to GET.',
            },
            headers: {
              type: 'object',
              additionalProperties: { type: 'string' },
              description: 'Request headers as a string-to-string record.',
            },
            body: {
              description: 'Optional request body.',
            },
          },
          description: 'Optional per-request options.',
        },
      },
      required: ['url'],
      additionalProperties: false,
    },
  },
  allowedOrigins: {
    description:
      'Report the origins this client may reach (the effective allowlist, ' +
      'including any trust-on-first-bind pins). Reveals no other policy bound.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
});

/** @type {(keyof HttpToolCapability)[]} */
const httpToolMethods = harden(
  /** @type {(keyof HttpToolCapability)[]} */ (Object.keys(httpToolSchemas)),
);

/**
 * Positional arg guards for a method, required first and then optional, read
 * straight out of `HttpClientInterface` so the hand-authored schema is pinned
 * against the guard the exo enforces.
 *
 * @param {string} method
 * @returns {Pattern[]}
 */
const positionalArgGuards = method => {
  const { methodGuards } = getInterfaceGuardPayload(
    /** @type {InterfaceGuard} */ (HttpClientInterface),
  );
  const { argGuards, optionalArgGuards } = getMethodGuardPayload(
    methodGuards[method],
  );
  return harden([...argGuards, ...(optionalArgGuards || [])]);
};

/**
 * Project a live `HttpResponse` remotable into a JSON-safe record the tool wire
 * can carry. The body is delivered decoded as `text` (`HttpResponse.text()`);
 * the caller parses JSON itself. The byte cap and `truncated` flag are the
 * `HttpClient`'s, enforced before the response ever reaches here.
 *
 * @param {ERef<HttpResponseView>} response
 * @returns {Promise<object>}
 */
const projectResponse = async response => {
  const [status, statusText, ok, url, headers, truncated, body] =
    await Promise.all([
      E(response).status(),
      E(response).statusText(),
      E(response).ok(),
      E(response).url(),
      E(response).headers(),
      E(response).truncated(),
      E(response).text(),
    ]);
  return harden({ status, statusText, ok, url, headers, truncated, body });
};

/**
 * Build agent-tool records for a live `HttpClient` capability — `fetch` and
 * `allowedOrigins`. The origin allowlist, rate limit, response-byte cap,
 * timeout, redirect containment, and revocation are all enforced inside the
 * `HttpClient` exo (design § Network (HTTP) tier), so this surface adds no
 * authority beyond what the capability already carries; an ungranted client
 * means the group is simply absent from the catalog.
 *
 * @param {ERef<HttpToolCapability>} httpCap
 * @returns {ToolRecord[]}
 */
export const makeHttpTool = httpCap => {
  const records = httpToolMethods.map(method => {
    const schema = httpToolSchemas[method];
    const argGuards = positionalArgGuards(method);
    const paramNames = Object.keys(
      /** @type {{ properties?: Record<string, unknown> }} */ (
        schema.parameters
      ).properties || {},
    );
    return makeTool({
      name: method,
      description: schema.description,
      parameters: schema.parameters,
      argGuards,
      execute: async argsRecord => {
        await null;
        const positional = paramNames.map(paramName => argsRecord[paramName]);
        while (
          positional.length > 0 &&
          positional[positional.length - 1] === undefined
        ) {
          positional.pop();
        }
        const httpMethod = /** @type {keyof HttpToolCapability} */ (method);
        const http = /** @type {HttpToolDispatch} */ (E(httpCap));
        if (method === 'fetch') {
          // `fetch` returns a live `HttpResponse` remotable; bridge it to a
          // JSON-safe record rather than forwarding the capability.
          const response = /** @type {ERef<HttpResponseView>} */ (
            await http[httpMethod](...positional)
          );
          return projectResponse(response);
        }
        return http[httpMethod](...positional);
      },
    });
  });
  return harden(records);
};
harden(makeHttpTool);
