// @ts-nocheck
/* global globalThis, issueCommand */

// Bootstrap for the `xsnap-worker` daemon formula type.
//
// Runs *inside* the xsnap engine on first boot only. After the first
// snapshot is taken, this file is never re-evaluated: the closures and
// `globalThis` mutations established here live in the snapshotted heap and
// are restored verbatim on revival.
//
// Wire protocol:
//   - host → worker: one `vat.issueCommand(bytes)` per request, delivered
//     here as a `globalThis.handleCommand(bytes)` call.
//   - worker → host: each request is replied to by calling the host-provided
//     `issueCommand` global with the response bytes. xsnap routes that back
//     to the host's own `handleCommand` callback. The return value of *this*
//     `handleCommand` is unused for replies; we return an empty buffer to
//     satisfy xsnap's protocol.
//
// Each request is `{ type: 'eval', source }`. The reply is `{ ok: <value> }`
// or `{ error: <message> }`. The evaluated source runs in the worker's
// global scope, so anything it writes to `globalThis` survives across
// requests — and across snapshot boundaries.
//
// This is intentionally not CapTP and not SES. xsnap's runtime has no Node
// module system and no SES shim out of the box; the eval-only contract is
// the smallest interface that demonstrates orthogonal persistence end to
// end and is enough for the daemon to drive guest code.
//
// Persistence boundary: the daemon takes the snapshot. There is no durable
// zone — values not reachable from `globalThis` at snapshot time are gone.

const decoder = new TextDecoder();
const encoder = new TextEncoder();
const indirectEval = (0, eval); // eslint-disable-line no-eval

const sendReply = response => {
  let body;
  try {
    body = JSON.stringify(response);
  } catch (serializeErr) {
    body = JSON.stringify({
      error: `result not JSON-serializable: ${serializeErr.message}`,
    });
  }
  // xsnap's `issueCommand` accepts an ArrayBuffer; passing the underlying
  // buffer of an encoded Uint8Array is the canonical way to send bytes.
  issueCommand(encoder.encode(body).buffer);
};

globalThis.handleCommand = frame => {
  let request;
  try {
    request = JSON.parse(decoder.decode(new Uint8Array(frame)));
  } catch (parseErr) {
    sendReply({ error: `bad request: ${parseErr.message}` });
    return new Uint8Array();
  }
  if (!request || request.type !== 'eval') {
    sendReply({
      error: `unknown request type ${request && request.type}`,
    });
    return new Uint8Array();
  }
  let value;
  try {
    value = indirectEval(request.source);
  } catch (evalErr) {
    sendReply({ error: String((evalErr && evalErr.message) || evalErr) });
    return new Uint8Array();
  }
  sendReply({ ok: value === undefined ? null : value });
  return new Uint8Array();
};
