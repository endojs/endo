# `@endo/exo-google-sheets` package: Google Sheets connector

| | |
|---|---|
| **Created** | 2026-07-06 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Proposed |

## Summary

`@endo/exo-google-sheets` presents a Google Sheets spreadsheet as a passable
capability an agent can call over CapTP without ever seeing the OAuth
credential. The host performs the OAuth flow and holds the token behind an
[endoclaw-oauth](endoclaw-oauth.md) `OAuth` exo; the agent holds a
`Spreadsheet` exo and calls `E(sheet).read('Tasks!A1:C10')`. The credential is
structurally inaccessible: no method on any granted facet returns or forwards
it.

The exo package is backed by a lower-level plain library,
`@endo/google-sheets`, which speaks the Sheets REST API against an injected
`fetch`-shaped power and knows nothing about CapTP, exos, or tokens. This
mirrors the [exo-zip-package](exo-zip-package.md) shape (`@endo/exo-zip` wraps
`@endo/zip`): the `exo-` prefix marks the package whose primary surface is
passable interfaces exchanged over CapTP, and the plain sibling stays free of
Passable machinery.

## What is the Problem Being Solved?

Agents routinely need tabular state that humans also edit: task queues,
inventories, budgets, contact lists. Google Sheets is where much of that data
already lives. Today an Endo agent has no principled way to touch it: handing
the agent a Google OAuth token grants the whole Google account surface and
lets the agent exfiltrate the credential; handing it nothing forces a human to
copy data by hand.

The ocap answer is already designed in two layers this document builds on
rather than reinvents:

- [endoclaw-network-fetch](endoclaw-network-fetch.md) confines outbound HTTP
  to a host-controlled origin allowlist (`HttpClient`).
- [endoclaw-oauth](endoclaw-oauth.md) wraps an `HttpClient` with token
  injection, path restrictions, and read-only mode (`OAuth`); its own worked
  example is `E(gmail).fetch('/messages')`.

What is missing is the domain layer: the raw `OAuth.fetch` surface makes the
agent assemble Sheets REST URLs, encode value ranges, page results, and parse
quota errors by hand, and the path-pattern attenuation `setAllowedPaths`
offers is far coarser than "read-only access to one tab of one spreadsheet".
This design adds that layer as a typed, attenuable, passable capability.

## Package Split

Two packages, mirroring `@endo/zip` / `@endo/exo-zip`
([exo-zip-package](exo-zip-package.md) Design Decision 8):

- **`@endo/google-sheets`** (`packages/google-sheets/`): a plain, portable
  Sheets API client. Pure ECMAScript, no Node built-ins, loadable in XS and
  SES realms. Its factory takes a `fetch`-shaped function as a power:

  ```js
  import { makeSheetsClient } from '@endo/google-sheets';
  const client = makeSheetsClient(fetchPower, { spreadsheetId });
  ```

  The client never sees a token. In production the injected power is the
  bound `fetch` of an `OAuth` exo (which injects the `Authorization` header
  itself); in tests it is a stub. The client owns URL construction, A1-range
  encoding, `values.get` / `values.batchGet` / `values.update` /
  `values.append` / `values.clear` and `spreadsheets.get` calls, response
  parsing, pagination, and mapping Google error payloads to structured
  errors.

- **`@endo/exo-google-sheets`** (`packages/exo-google-sheets/`): wraps a
  client in hardened exos with interface guards and facet attenuation, for
  consumption over CapTP.

  ```js
  import { makeExoSpreadsheet } from '@endo/exo-google-sheets';
  const { spreadsheet, writer, control } = makeExoSpreadsheet(client);
  ```

The layering, end to end:

```mermaid
flowchart LR
  agent["Agent (guest)"]
  sheet["Spreadsheet exo<br/>@endo/exo-google-sheets"]
  client["Sheets client<br/>@endo/google-sheets"]
  oauth["OAuth exo<br/>endoclaw-oauth"]
  http["HttpClient exo<br/>endoclaw-network-fetch"]
  api["sheets.googleapis.com"]
  agent -- "CapTP: read/write/append" --> sheet
  sheet --> client
  client -- "fetch power" --> oauth
  oauth -- "token injected" --> http
  http -- "origin allowlist" --> api
```

The host composes the stack at mint time; the agent receives only the top.

## Capability Shape

Three facets per spreadsheet, from broadest to narrowest authority:
`SpreadsheetControl` (host-side caretaker), `SpreadsheetWriter` (read-write),
`Spreadsheet` (read-only). Following the hidden-facet attenuation pattern of
[daemon-mount-capabilities](daemon-mount-capabilities.md): the reader is
derivable from the writer (`readOnly()`), never the reverse, and the control
facet is never reachable from either.

```ts
// Cell values are copyable passables.
type CellValue = string | number | boolean | null;

type SheetInfo = {
  sheetId: number;
  title: string;
  index: number;
  rowCount: number;
  columnCount: number;
};

interface Spreadsheet {
  // Read-only facet. Default grant.
  title(): Promise<string>;
  sheets(): Promise<SheetInfo[]>;
  sheet(title: string): Spreadsheet;          // attenuate to one tab
  read(range: string): Promise<CellValue[][]>;          // A1 notation
  readBatch(ranges: string[]): Promise<CellValue[][][]>;
  readRecords(range: string): Promise<Record<string, CellValue>[]>;
  follow(range: string): AsyncIterableIterator<RangeChange>;
  help(): string;
}

interface SpreadsheetWriter /* extends Spreadsheet */ {
  // Read-write facet. Separate, narrower-audience grant.
  write(range: string, values: CellValue[][]): Promise<UpdateResult>;
  writeBatch(updates: { range: string, values: CellValue[][] }[]):
    Promise<UpdateResult[]>;
  append(range: string, rows: CellValue[][]): Promise<AppendResult>;
  clear(range: string): Promise<void>;
  readOnly(): Spreadsheet;
  sheet(title: string): SpreadsheetWriter;    // tab-scoped writer
}

interface SpreadsheetControl {
  // Host-side caretaker. Never granted to guests.
  setAllowedSheets(titles: string[] | null): void;  // null = all tabs
  setReadOnly(flag: boolean): void;
  setMaxCellsPerRead(n: number): void;
  setPollIntervalMs(ms: number): void;
  revoke(): void;
  help(): string;
}

type UpdateResult = { updatedRange: string, updatedCells: number };
type AppendResult = { updatedRange: string, appendedRows: number };
type RangeChange = { range: string, values: CellValue[][], revision: string };
```

### Mapping Sheets values onto passables

- **Cell values** are the copyable scalars `string | number | boolean | null`.
  The client requests `valueRenderOption=UNFORMATTED_VALUE`, so numbers arrive
  as numbers, not locale-formatted strings. An empty cell is `null`.
- **Dates and times** arrive as Sheets serial numbers (days since 1899-12-30)
  under `UNFORMATTED_VALUE`. The client passes them through as numbers and
  exports `serialToISO8601` / `iso8601ToSerial` helpers; it does not guess
  which numbers are dates. Callers that want strings can opt into
  `FORMATTED_VALUE` per call via an options bag.
- **Ranges** are A1-notation strings (`'Tasks!A1:C10'`, `'Sheet1'`,
  `'A:A'`). Strings are selectors, not authorities, per the
  [daemon-mount-capabilities](daemon-mount-capabilities.md) principle: the
  exo validates every range against its scope (its tab attenuation and the
  control facet's `setAllowedSheets`) before any network call, exactly as
  `EndoMount` confines paths and `HttpClient` confines origins. A tab-scoped
  facet minted by `sheet('Tasks')` rejects ranges naming any other tab and
  treats bare ranges (`'A1:C10'`) as scoped to its tab.
- **Rectangles** are `CellValue[][]` (rows of columns), hardened copyable
  arrays: the same shape the REST API uses, cheap to marshal.
- **Records** (`readRecords`) treat row 1 of the range as a header row and
  return one copyable record per subsequent row, keyed by header. This is
  sugar computed client-side from `read`; it exists because "a sheet as a
  list of records" is the dominant agent use case and saves every consumer
  reimplementing the zip.

### Read-only and write facets

Write authority is a separate grant, not a mode bit the agent can flip. The
host mints `{ spreadsheet, writer, control }` once; it typically grants
`spreadsheet` by pet name (`budget`) and withholds `writer` unless the use
case demands it (`budget-writer`). `writer.readOnly()` lets an agent that
holds write authority delegate a read-only view onward, mirroring
`EndoMount.readOnly()`. `control.setReadOnly(true)` is the caretaker's
emergency brake over already-granted writers, on top of revocation.

This is deliberately finer than what the underlying OAuth token can express:
a Google token scoped `spreadsheets.readonly` cannot write anywhere, but a
read-write token is account-wide for the Sheets API. The exo layer narrows a
necessarily-broad token to one spreadsheet, optionally one tab, optionally
read-only. Defense in depth: hosts should still request the narrowest Google
scope that covers the intended grants, and the underlying `OAuth` exo should
carry `setAllowedPaths` patterns pinned to the granted spreadsheet ids.

### Errors, rate limits, and batching

- **Quota errors surface structurally.** The Sheets API enforces per-minute
  read and write quotas; a 429 or `RESOURCE_EXHAUSTED` maps to a thrown
  error with `{ code: 'quota-exceeded', retryAfterSeconds }` (copyable data
  properties), so a remote agent can back off intelligently instead of
  parsing Google's error prose. Permission and not-found errors map to
  `'permission-denied'` and `'not-found'` similarly. The full mapping lives
  in `@endo/google-sheets` so it is testable without exos.
- **The exo throttles before Google does.** A token-bucket rate limit inside
  the exo (tunable via the control facet) keeps one enthusiastic agent from
  burning the whole project's quota and turns overrun into fast local
  errors rather than remote 429s. `setMaxCellsPerRead` bounds response
  sizes the same way `HttpClient.setMaxResponseBytes` does.
- **Batching is first-class.** `readBatch` and `writeBatch` map to
  `values.batchGet` / `values.batchUpdate`, one HTTP call each. Agents
  should batch; the interface makes the batched path as convenient as the
  single path. Structural `batchUpdate` operations (formatting, adding
  tabs, resizing) are out of scope for v1 (Open Question 1).

### Change notification

`follow(range)` returns an async iterator of `RangeChange` events, following
the daemon's established `followMessages` / `followNameChanges` subscription
idiom. v1 implements it by **polling**: the host-side exo re-reads the range
on the control-facet-configured interval (default 30s), compares against the
last snapshot, and yields on difference. Polling costs read quota, which the
built-in throttle already accounts for.

The Sheets push model is the alternative: Google delivers change
notifications via Drive API `files.watch` channels, which require a public
HTTPS webhook endpoint and channel-renewal bookkeeping. That endpoint is
exactly what [endoclaw-webhooks](endoclaw-webhooks.md) provides (gateway
webhook routes delivered as inbox messages), so push is deferred as a phase
that plugs in behind the same `follow` contract once webhooks land, rather
than a reason to block v1 (Open Question 2). Notably, Drive watch events say
*that* a file changed, not *what* changed, so even the push implementation
polls the changed range to produce the event payload; push only replaces the
timer.

## Where the Connector Sits

All three placements from the prompt are true at different layers, and the
package split keeps them from tangling:

- **Standalone libraries** (`packages/google-sheets/`,
  `packages/exo-google-sheets/`): the substance of this design. Neither
  package depends on the daemon; `makeExoSpreadsheet(client)` runs wherever
  a `fetch` power exists.
- **Daemon capability**: how agents actually receive one. The host performs
  the OAuth flow per [endoclaw-oauth](endoclaw-oauth.md) (token in the
  daemon's formula store), mints the `OAuth` exo, composes
  `makeSheetsClient` and `makeExoSpreadsheet` over it, and grants the
  resulting facets by pet name. A `google-sheet` formula type capturing
  `{ oauthFormulaId, spreadsheetId, allowedSheets, readOnly }` makes grants
  durable across daemon restarts. This is Phase 3, small by construction
  because the exo package does the work.
- **Milestone 7 (Weblets and Integrations)**: the roadmap home. M7's goal is
  literally "OAuth-based external service integrations"; this design is the
  first concrete instance of the [endoclaw-oauth](endoclaw-oauth.md) pattern
  applied to a named service, and a template for Gmail and Calendar
  siblings.

**Not this design** (cross-references so the reader is not confused):
[endopi-provider-registry-and-oauth](endopi-provider-registry-and-oauth.md)
is OAuth to *LLM providers* for inference subscriptions, and the
`gateway-oauth-bonding` gap (tracked in the [README](README.md) M5 bucket) is
bonding an OAuth *login identity* to a public-key identity. Both are
identity-and-billing plumbing; this design is an agent *using* an external
service through a credential it cannot see.

## Dependencies

| Design | Relationship |
|--------|-------------|
| [endoclaw-oauth](endoclaw-oauth.md) | **Depends on.** The credential-capability layer; the injected fetch power is an `OAuth` exo's fetch. Not yet implemented; Phase 1-2 can develop against a stub fetch power in parallel. |
| [endoclaw-network-fetch](endoclaw-network-fetch.md) | **Depends on (transitively).** The origin-allowlist substrate under the OAuth exo. |
| [exo-zip-package](exo-zip-package.md) | **Precedent.** The `exo-` wrapper over a plain backing library; naming and layering mirrored here. |
| [daemon-mount-capabilities](daemon-mount-capabilities.md) | **Precedent.** Facet attenuation (`readOnly()`), strings-as-selectors range confinement, caretaker control. |
| [endoclaw-webhooks](endoclaw-webhooks.md) | **Future.** Push-based `follow` rides gateway webhook endpoints once they exist (Phase 5). |

## Implementation Phases

1. **`@endo/google-sheets` client (S-M).** `makeSheetsClient(fetchPower,
   opts)`: A1-range encode/validate helpers, `spreadsheets.get`, values
   get/batchGet/update/append/clear, `UNFORMATTED_VALUE` default, serial-date
   helpers, structured error mapping. Tested entirely against a stub fetch
   with recorded Sheets API fixtures; no network, no OAuth.
2. **`@endo/exo-google-sheets` facets (S-M).** `makeExoSpreadsheet(client,
   opts)` minting the three facets with interface guards; tab attenuation;
   range confinement; token-bucket throttle; `readRecords`; polling
   `follow`. Tests drive the facets over a loopback CapTP connection against
   the stubbed client.
3. **Daemon integration (S).** `google-sheet` formula type, host flow that
   composes an existing `OAuth` formula with a spreadsheet id, pet-name
   grant of reader and (optionally) writer facets. Gated on
   [endoclaw-oauth](endoclaw-oauth.md) implementation.
4. **Agent-facing polish (S).** `help()` text, a worked example in the
   package README (task-queue-in-a-sheet), tool-record surface for
   `@endo/agent-tools` consumers if wanted.
5. **Push notifications (M, deferred).** Drive `files.watch` channel
   management behind the existing `follow` contract, delivered through
   [endoclaw-webhooks](endoclaw-webhooks.md). To be filed as a follow-up
   design once webhooks land.

Phases 1 and 2 land together as one `feat(exo-google-sheets)` PR and do not
block on any unimplemented dependency; the OAuth exo is stubbed as a bare
`fetch` function until Phase 3.

## Design Decisions

1. **Two packages, plain client under the exo wrapper.** Mirrors
   `@endo/zip` / `@endo/exo-zip`: the plain client is testable without exo
   machinery, usable in non-CapTP contexts, and keeps Passable dependencies
   out of the protocol code. The `exo-` prefix follows the project
   convention that packages whose primary surface is passable-over-CapTP
   carry it.
2. **The client takes a fetch power, never a token.** Credential handling
   stays entirely in the [endoclaw-oauth](endoclaw-oauth.md) layer. There
   is no code path in either new package that touches, stores, or refreshes
   a token, so there is nothing to audit for leaks and nothing to reinvent.
3. **Per-spreadsheet capability, not a Sheets-service capability.** The
   grant granularity is one spreadsheet (optionally one tab). A wider
   "browse and open any spreadsheet in the account" capability would need
   Drive API listing and is a different, much broader authority; it can be
   layered later as a `SheetsService` exo that mints per-spreadsheet exos
   (Open Question 3).
4. **Writer is a hidden sibling facet, not a mode.** Read-only is the
   default grant; write authority arrives only as a distinct exo, per the
   [daemon-mount-capabilities](daemon-mount-capabilities.md) attenuation
   discipline. `readOnly()` narrows; nothing widens.
5. **`UNFORMATTED_VALUE` by default.** Numbers as numbers beats
   locale-formatted strings for program consumption; formatting is opt-in
   per call. Date serials pass through with conversion helpers rather than
   guessed coercion.
6. **Polling `follow` first, push later, same contract.** Push requires the
   webhook substrate and still needs a read to learn what changed; polling
   ships value now and the async-iterator contract survives the swap.
7. **Throttle and size-bound inside the exo.** Quota is a shared resource
   across every consumer of the host's Google project; the capability that
   spends it carries its own governor, adjustable from the control facet.

## Open Questions

1. Are structural `batchUpdate` operations (add/delete tabs, formatting,
   column resizing, data validation) in scope for the writer facet, or a
   separate `SpreadsheetStructure` facet, or out of scope indefinitely? The
   `batchUpdate` request surface is enormous; v1 proposes values-only.
2. Should push-based change notification (Phase 5) be a mode of this
   package or its own design document once
   [endoclaw-webhooks](endoclaw-webhooks.md) exists? The channel-renewal
   bookkeeping (channels expire, must be re-armed, deliver to a public
   URL) may deserve its own treatment shared by all Drive-family watchers.
3. Is a `SheetsService` exo (Drive-backed listing, mints per-spreadsheet
   exos) wanted, and if so does it belong here or in a sibling design? It
   changes the authority story from "this one document" to "the account's
   documents", which is a materially different grant.
4. Should `readRecords` also have a writing dual (`appendRecords`,
   `updateRecordsWhere`)? Convenient for the task-queue use case, but it
   starts to encode a schema layer (header mapping, row identity) that may
   belong in a consumer library rather than the connector.
5. Which OAuth flow does the host run for first-mint UX (browser redirect
   against a localhost callback, or the device-code grant), and does the
   Sheets connector need to care, or is that fully settled inside
   [endoclaw-oauth](endoclaw-oauth.md) and the daemon's form-request UI?

## Prompt

> Propose a design for a **Google Sheets connector**,
> `@endo/exo-google-sheets`: an Exo that presents a Google Sheets
> spreadsheet (or the Sheets API surface) as a passable capability an agent
> can call over CapTP without ever seeing the OAuth credential. Consider
> whether it is backed by a lower-level `@endo/google-sheets` package (a
> plain, non-CapTP Sheets API client library) that the `exo-` package wraps
> and hardens, mirroring the `@endo/exo-zip` shape (`@endo/exo-zip` wraps
> `@endo/zip`).
>
> Design questions the document should settle or surface as open questions:
> the capability shape (read range, write range, append row, list sheets,
> watch for changes; how cell values, A1 ranges, and structured records map
> onto passable values); read-only vs read-write facets and whether write
> access is a separate, narrower capability (hidden-facet attenuation, as
> `daemon-mount` does); credential handling (the host performs the OAuth
> flow and injects the token; the agent calls `E(sheet).getRange(...)` and
> the credential is structurally inaccessible, per the `endoclaw-oauth`
> `OAuth` capability pattern layered on the `endoclaw-network-fetch`
> `HttpClient` allowlist substrate); where the connector sits (daemon
> capability, Milestone 7 weblet/integration, or standalone library consumed
> by both); change notification (polling vs the Sheets API push model); and
> rate limiting, batching (`batchUpdate`), and error/quota surfacing over
> CapTP.
