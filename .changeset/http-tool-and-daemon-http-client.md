---
'@endo/exo-http-client': minor
'@endo/agent-tools': minor
'@endo/daemon': minor
---

Export the `HttpClient` exo's interface guards (`FetchOptionsShape`,
`HttpClientInterface`, `HttpClientControlInterface`, `HttpResponseInterface`)
from `@endo/exo-http-client` so tool adapters can pin their wire schemas against
the guards the exo enforces rather than a hand-typed copy that could drift. Add
`@endo/agent-tools`' `makeHttpTool` (the `./http-tool.js` subpath), which builds
LLM-facing `fetch` / `allowedOrigins` tool records over an `HttpClient`
capability and projects the live `HttpResponse` remotable to a JSON-safe record.
Add the `@endo/daemon` `EndoHost.provideHttpClient` / `getHttpClientControl`
methods that mint a confined outbound-HTTP client from a host-owned `fetch` seam,
persist its formula-owned policy, and retain the policy-bearing
`HttpClientControl` host-side.

Add `HttpResponse.stream()`, which hauls the already-bounded response body as an
`@endo/exo-stream` `PassableBytesReader` (consume it with `iterateBytesReader`)
so guests can read HTTP content bodies incrementally over CapTP instead of
buffering the whole body as one `text()` string. The stream is capped by the
same `maxResponseBytes` bound and is independent of `text()`/`json()`.
