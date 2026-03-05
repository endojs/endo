# EndoClaw: Browser Capability

| | |
|---|---|
| **Created** | 2026-03-03 |
| **Updated** | 2026-03-03 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |
| **Parent** | [endoclaw](endoclaw.md) |

## Summary

A `Browser` capability backed by Playwright that gives an agent a
confined browsing context. The host controls which domains are
accessible, whether form submission is allowed, and can revoke at any
time. The agent navigates, extracts data, fills forms, and takes
snapshots — but only within its allowed scope.

## Capability Shape

```ts
interface Browser {
  goto(url: string): Promise<Page>;
  help(): string;
}

interface Page {
  url(): string;
  title(): Promise<string>;
  textContent(selector: string): Promise<string>;
  querySelector(selector: string): Promise<Element>;
  querySelectorAll(selector: string): Promise<Element[]>;
  fill(selector: string, value: string): Promise<void>;
  click(selector: string): Promise<void>;
  submit(selector: string): Promise<void>;
  snapshot(): Promise<string>;  // returns page text or screenshot
  waitForSelector(selector: string): Promise<void>;
  help(): string;
}

interface BrowserControl {
  setAllowedOrigins(origins: string[]): void;
  setReadOnly(flag: boolean): void;  // disables fill/click/submit
  revoke(): void;
  help(): string;
}
```

## How It Works

1. Host creates a `Browser` / `BrowserControl` pair, configuring
   allowed origins (e.g., `['https://airline.example.com']`).
2. Agent calls `E(browser).goto('https://airline.example.com/checkin')`.
3. The `Browser` exo validates the URL against the allowed origins
   before navigating. Requests to disallowed origins throw.
4. Agent interacts with the page via `Page` methods — extraction,
   form filling, clicking.
5. The backing Playwright instance runs in the daemon worker with
   `--no-sandbox` (already in a confined worker) or in a separate
   headless Chrome process.

## Endo Idiom

**Structural origin confinement.** The agent cannot navigate to
`https://evil.example.com` to exfiltrate data because the `Browser`
exo rejects URLs outside the allowed origins. This is structural — no
URL the agent can construct will reach a disallowed origin.

**Read-only mode.** `BrowserControl.setReadOnly(true)` disables all
mutation methods (`fill`, `click`, `submit`). The agent can extract data
but cannot modify pages. Useful for web research without side effects.

**Caretaker revocation.** The host can revoke the browser capability at
any time, closing the Playwright context and invalidating all `Page`
references.

**No cookie/credential leakage.** The `Page` interface does not expose
cookies, localStorage, or network requests. The agent interacts with
page content through DOM methods only.

## Use Cases

- Flight check-in (navigate to airline, fill form, submit)
- Web research (navigate to pages, extract text content)
- Price monitoring (periodically snapshot a product page)
- Form automation (fill and submit web forms)

## Depends On

- Playwright or Playwright as a daemon dependency
- Daemon worker infrastructure for headless Chrome lifecycle
- Optional: [daemon-os-sandbox-plugin](daemon-os-sandbox-plugin.md) for
  additional Chrome process confinement
