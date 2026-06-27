---
'@endo/daemon': minor
'@endo/cli': minor
'@endo/spaces-util': minor
'@endo/chat': minor
---

Adds host-only `EndoHost.getFormula(identifier)` for retrieving the
formula record (type + per-property literals and references) for a
local formula identifier, and retires the `@info` (`INFO`) special
name on host pet sitters. Per `designs/formula-inspector.md`: the
former `E(AGENT).lookup(["INFO", ...])` shape is replaced by direct
`E(host).getFormula(identifier)` calls. `getFormula` is absent on the
guest facet by precedent (see `daemon-retention-paths.md` and the
host-only `traces` facet) and rejects cross-peer locators.

Adds `endo inspect <name-or-identifier>` CLI verb with `--identifier`
and `--json` flags. The verb resolves a pet name (or, with
`--identifier`, an already-encoded formula identifier) via the host
facet's `getFormula` method, and renders the result either as a
human-readable per-property block or as the raw `FormulaRecord` JSON
for scripting.

Adds the companion chat surface as confined Preact in
`@endo/spaces-util`. The Value modal grows a Formula back face, reached
via a flip control and a symmetric `F` accelerator that flips in either
direction. The formula record — daemon-supplied and untrusted — renders
through the same `renderConfined` boundary as the rest of the modal, so
its property values and reference names reach the DOM only as escaped
text; the keypair type's `privateKey` is suppressed. Reference buttons
navigate to the referenced formula's value with a back stack that
Backspace pops. See `designs/formula-inspector.md` for the full
chat-side contract.
