# `@endo/exo-playwright`

A `Browser` exo with structural origin confinement, designed to adapt a
Playwright backend.

The host configures an origin allowlist up front; the agent navigates,
reads page text, fills inputs, clicks, and submits forms, but only
against URLs whose origin appears in the allowlist.
The agent has no way to construct a URL that escapes the configured
set: `goto()` rejects the request before any network or backend call
runs.

The browser action is performed by a `Backend` parameter the factory
accepts.
The shape of the `Backend` is the seam where a real Playwright driver
plugs in; in tests, a small in-memory fake stands in.
Splitting the safety property (origin enforcement, read-only mediation,
revocation) from the transport (Playwright) lets the load-bearing
properties be tested without bringing in a 150 MB chromium download.

## Status

This release contains the safety scaffolding (origin allowlist,
read-only mediation, revocation) and the in-memory fake backend used by
its tests.
A real Playwright adapter is a follow-up.

## Install

```sh
npm install @endo/exo-playwright
```

## Usage

```js
import { makeBrowserAndControl } from '@endo/exo-playwright';

const { browser, control } = makeBrowserAndControl({
  backend, // an object implementing the `Backend` shape below
  allowedOrigins: ['https://airline.example.com'],
});

const page = await E(browser).goto('https://airline.example.com/checkin');
await E(page).fill('#name', 'Jane');
await E(page).submit('#form');

// Host can later restrict or revoke.
await E(control).setReadOnly(true);
await E(control).revoke();
```

## Capability shape

```ts
interface Browser {
  goto(url: string): Promise<Page>;
  help(): string;
}

interface Page {
  url(): string;
  title(): Promise<string>;
  textContent(selector: string): Promise<string>;
  fill(selector: string, value: string): Promise<void>;
  click(selector: string): Promise<void>;
  submit(selector: string): Promise<void>;
  snapshot(): Promise<string>;
  waitForSelector(selector: string): Promise<void>;
  close(): Promise<void>;
  help(): string;
}

interface BrowserControl {
  setAllowedOrigins(origins: string[]): void;
  getAllowedOrigins(): string[];
  setReadOnly(flag: boolean): void;
  isReadOnly(): boolean;
  revoke(): Promise<void>;
  isRevoked(): boolean;
  help(): string;
}
```

## Backend shape

```ts
interface BackendPage {
  url(): string;
  title(): Promise<string>;
  textContent(selector: string): Promise<string>;
  fill(selector: string, value: string): Promise<void>;
  click(selector: string): Promise<void>;
  submit(selector: string): Promise<void>;
  snapshot(): Promise<string>;
  waitForSelector(selector: string): Promise<void>;
  close(): Promise<void>;
}

interface Backend {
  newPage(url: string): Promise<BackendPage>;
  close(): Promise<void>;
}
```

The `Backend` never sees the allowlist; the `Browser` exo filters URLs
before calling `newPage`.

## Origin matching

Allowlist matching is by exact origin (scheme + host + port).
An entry must be exactly the URL's origin component
(`https://example.com:8443`, not `https://example.com/path`).
Subdomains are not implicitly covered: `https://example.com` does not
admit `https://sub.example.com`.

## Hardened JavaScript

In a post-lockdown environment, this module hardens its interfaces to
reduce supply chain attack exposure.
