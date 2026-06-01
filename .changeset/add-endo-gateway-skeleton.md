---
'@endo/gateway': minor
---

Add `@endo/gateway` package skeleton per `designs/gateway-package.md`. The
phase-1 slice exposes `makeGateway({ powers, config })` returning a hardened
exo with `start`, `stop`, `getBindAddress`, `getApps`, and `getConfig`;
`ENDO_HTTP_ADDR` parsing with the OS-assigned-port (`:0`) convention and a
`0.0.0.0:3469` default; an in-memory `AppsNameHub` exo (`bind`, `unbind`,
`list`, `lookup`, `has`) for virtual-host routing (feature 2 of the
ten-feature design); and per-feature configuration toggles validated at
`make` time. The remaining features (Chat hosting, Git over HTTP, UDS
bootstrap, Familiar-bundled fallback, public CapTP relay, admin daemon,
`/ocapn-cbor-np` WebSocket, HTTPS proxy compatibility, OS packaging) land
as follow-on PRs.
