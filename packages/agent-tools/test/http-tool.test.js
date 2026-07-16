// @ts-check

// Establish a SES perimeter (provides the `harden` global).
// eslint-disable-next-line import/order
import '@endo/init/debug.js';

/** @import { ERef } from '@endo/eventual-send' */
/** @import { InterfaceGuard, Pattern } from '@endo/patterns' */
/** @import { HttpToolCapability, ToolRecord } from '../src/types.js' */

import test from 'ava';
import { Ajv } from 'ajv';
import {
  matches,
  getInterfaceGuardPayload,
  getMethodGuardPayload,
} from '@endo/patterns';
import { Far } from '@endo/pass-style';
import {
  HttpClientInterface,
  HttpResponseInterface,
} from '@endo/exo-http-client';

import { makeHttpTool } from '../src/json-tools/http.js';

const ajv = new Ajv({ strict: false });

/**
 * Positional guard structure from `HttpClientInterface`.
 *
 * @param {string} method
 */
const guardShapeFor = method => {
  const { methodGuards } = getInterfaceGuardPayload(
    /** @type {InterfaceGuard} */ (HttpClientInterface),
  );
  const { argGuards, optionalArgGuards } = getMethodGuardPayload(
    methodGuards[method],
  );
  const optional = optionalArgGuards || [];
  return {
    requiredCount: argGuards.length,
    guards: harden([...argGuards, ...optional]),
  };
};

/**
 * @param {{requiredCount:number, guards:Pattern[]}} shape
 * @param {string[]} paramNames
 * @param {Record<string, unknown>} record
 */
const guardAccepts = (shape, paramNames, record) => {
  const { requiredCount, guards } = shape;
  const allowed = new Set(paramNames.slice(0, guards.length));
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) return false;
  }
  for (let i = 0; i < guards.length; i += 1) {
    const key = paramNames[i];
    const present =
      Object.prototype.hasOwnProperty.call(record, key) &&
      record[key] !== undefined;
    if (present) {
      if (!matches(record[key], guards[i])) return false;
    } else if (i < requiredCount) {
      return false;
    }
  }
  return true;
};

/** @param {ToolRecord} tool */
const paramNamesOf = tool =>
  Object.keys(
    /** @type {{ properties?: Record<string, unknown> }} */ (tool.parameters)
      .properties || {},
  );

const inertHttp = /** @type {ERef<HttpToolCapability>} */ (
  /** @type {unknown} */ (Far('InertHttp', {}))
);

const toolsByName = () => {
  /** @type {Record<string, ToolRecord>} */
  const byName = {};
  for (const tool of makeHttpTool(inertHttp)) {
    byName[tool.name] = tool;
  }
  return byName;
};

test('makeHttpTool emits fetch and allowedOrigins tool records', t => {
  const byName = toolsByName();
  t.deepEqual(Object.keys(byName).sort(), ['allowedOrigins', 'fetch']);
  t.is(typeof byName.fetch.invoke, 'function');
});

test('tool record shape: inputSchema is the same object as parameters', t => {
  const byName = toolsByName();
  for (const tool of Object.values(byName)) {
    t.is(typeof tool.description, 'string');
    t.truthy(tool.parameters);
    t.is(tool.inputSchema, tool.parameters);
    t.is(typeof tool.invoke, 'function');
  }
});

// --- divergence gate: hand-authored schema ⟷ runtime guard ------------------

/** Candidate args records for the fetch tool. */
const fetchRecords = harden([
  {},
  { url: 'https://api.example.com/data' },
  { url: 123 },
  { url: 'https://api.example.com/data', options: {} },
  { url: 'https://api.example.com/data', options: { method: 'POST' } },
  { url: 'https://api.example.com/data', options: { method: 5 } },
  { url: 'https://api.example.com/data', options: { headers: { a: 'b' } } },
  { url: 'https://api.example.com/data', options: { headers: { a: 5 } } },
  { url: 'https://api.example.com/data', options: { body: 'payload' } },
  // Open `options` record: the runtime `M.splitRecord` admits unlisted keys, so
  // the schema's `options` object is deliberately left open to agree.
  { url: 'https://api.example.com/data', options: { bogus: true } },
  // Out-of-band top-level key: top-level `additionalProperties: false` and the
  // guard's fixed positional arity both reject it.
  { url: 'https://api.example.com/data', extra: 'x' },
]);

/** Candidate args records for the allowedOrigins tool. */
const allowedOriginsRecords = harden([{}, { anything: 1 }]);

const checkAgreement = (t, tool, records) => {
  const shape = guardShapeFor(tool.name);
  const paramNames = paramNamesOf(tool);
  const validate = ajv.compile(tool.parameters);
  for (const record of records) {
    const guardOk = guardAccepts(shape, paramNames, record);
    const schemaOk = validate({ ...record });
    t.is(
      schemaOk,
      guardOk,
      `${tool.name}: schema=${schemaOk} guard=${guardOk} for ${JSON.stringify(
        record,
      )}`,
    );
  }
};

test('schema ⟷ guard agree for http.fetch', t => {
  checkAgreement(t, toolsByName().fetch, fetchRecords);
});

test('schema ⟷ guard agree for http.allowedOrigins', t => {
  checkAgreement(t, toolsByName().allowedOrigins, allowedOriginsRecords);
});

// --- output-side pin: projectResponse ⟷ HttpResponseInterface ---------------
// The `fetch` tool's `execute` projects the live `HttpResponse` remotable to a
// JSON record by calling this fixed set of accessors (see `projectResponse` in
// src/json-tools/http.js). Nothing on the input side pins this output seam, so a
// rename of any of these methods on `HttpResponse` would surface only as a
// runtime throw and the advertised return shape would silently go stale. Pin
// the accessors the projection depends on against the guards the exo actually
// enforces, exactly as the input schema is pinned against `HttpClientInterface`
// — this is the reason the PR exports `HttpResponseInterface`. Keep this list in
// sync with `projectResponse`.
const projectedResponseMethods = harden([
  'status',
  'statusText',
  'ok',
  'url',
  'headers',
  'truncated',
  'text',
]);

test('projectResponse accessors are pinned to HttpResponseInterface', t => {
  const { methodGuards } = getInterfaceGuardPayload(
    /** @type {InterfaceGuard} */ (HttpResponseInterface),
  );
  const declared = new Set(Object.keys(methodGuards));
  for (const method of projectedResponseMethods) {
    t.true(
      declared.has(method),
      `HttpResponse.${method} must exist on HttpResponseInterface (projectResponse depends on it)`,
    );
  }
});

// --- dispatch + response bridging -------------------------------------------

// A fake `HttpClient` whose `fetch` returns a live `HttpResponse` remotable,
// mirroring the real capability so the tool's response-bridging path is
// exercised without any real network.
const makeFakeHttp = ({ body = 'ok', status = 200 } = {}) => {
  /** @type {any[]} */
  const calls = [];
  const http = Far('FakeHttpClient', {
    fetch: async (url, options) => {
      calls.push({ url, options });
      return Far('FakeHttpResponse', {
        status: () => status,
        statusText: () => (status === 200 ? 'OK' : 'Error'),
        ok: () => status >= 200 && status < 300,
        headers: () => harden({ 'content-type': 'text/plain' }),
        url: () => url,
        truncated: () => false,
        maxResponseBytes: () => 1024,
        text: async () => body,
        json: async () => harden(JSON.parse(body)),
        help: () => 'fake response',
      });
    },
    allowedOrigins: () => harden(['https://api.example.com']),
    help: () => 'fake client',
  });
  return { http, calls };
};

test('fetch tool forwards url/options and projects the response to JSON', async t => {
  const { http, calls } = makeFakeHttp({ body: '{"ok":true}' });
  /** @type {Record<string, ToolRecord>} */
  const byName = {};
  for (const tool of makeHttpTool(/** @type {any} */ (http))) {
    byName[tool.name] = tool;
  }
  const result = /** @type {any} */ (
    await byName.fetch.invoke({
      url: 'https://api.example.com/data',
      options: { method: 'POST', headers: { accept: 'application/json' } },
    })
  );
  t.deepEqual(calls[0], {
    url: 'https://api.example.com/data',
    options: { method: 'POST', headers: { accept: 'application/json' } },
  });
  // The live `HttpResponse` remotable is projected to a JSON-safe record.
  t.deepEqual(result, {
    status: 200,
    statusText: 'OK',
    ok: true,
    url: 'https://api.example.com/data',
    headers: { 'content-type': 'text/plain' },
    truncated: false,
    body: '{"ok":true}',
  });
});

test('fetch tool works with no options', async t => {
  const { http, calls } = makeFakeHttp();
  /** @type {Record<string, ToolRecord>} */
  const byName = {};
  for (const tool of makeHttpTool(/** @type {any} */ (http))) {
    byName[tool.name] = tool;
  }
  const result = /** @type {any} */ (
    await byName.fetch.invoke({ url: 'https://api.example.com/x' })
  );
  t.is(calls[0].options, undefined);
  t.is(result.body, 'ok');
  t.is(result.status, 200);
});

test('allowedOrigins tool reports the reachable origins', async t => {
  const { http } = makeFakeHttp();
  /** @type {Record<string, ToolRecord>} */
  const byName = {};
  for (const tool of makeHttpTool(/** @type {any} */ (http))) {
    byName[tool.name] = tool;
  }
  const result = await byName.allowedOrigins.invoke({});
  t.deepEqual(result, ['https://api.example.com']);
});

test('fetch tool rejects a non-string url at the guard', async t => {
  const { http } = makeFakeHttp();
  /** @type {Record<string, ToolRecord>} */
  const byName = {};
  for (const tool of makeHttpTool(/** @type {any} */ (http))) {
    byName[tool.name] = tool;
  }
  await t.throwsAsync(() =>
    byName.fetch.invoke({ url: /** @type {any} */ (123) }),
  );
});

test('fetch tool rejects an out-of-schema argument key', async t => {
  const { http } = makeFakeHttp();
  /** @type {Record<string, ToolRecord>} */
  const byName = {};
  for (const tool of makeHttpTool(/** @type {any} */ (http))) {
    byName[tool.name] = tool;
  }
  await t.throwsAsync(
    () =>
      byName.fetch.invoke({
        url: 'https://api.example.com/x',
        bogus: 'nope',
      }),
    { message: /unexpected tool argument key "bogus"/ },
  );
});
