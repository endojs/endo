# Change Log

## 0.1.0 (Unreleased)

Initial release.
Phase-1 skeleton of the `@endo/gateway` package per
`designs/gateway-package.md`:

- `makeGateway({ powers, config })` factory returning a hardened
  gateway exo with `start`, `stop`, `getBindAddress`, `getApps`.
- `ENDO_HTTP_ADDR` parsing with the OS-assigned-port (`:0`)
  convention; the default is `0.0.0.0:3469`.
- In-memory `AppsNameHub` exo with `bind`, `unbind`, `list`,
  `lookup`.
- Per-feature configuration toggles validated at `make` time.

Follow-on PRs land features 1, 3, 4, 5, 6, 7, 8, 9, 10 from the
design.
