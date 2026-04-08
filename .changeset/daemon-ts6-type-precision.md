---
'@endo/daemon': patch
---

TypeScript 6 conformance: public types in `types.d.ts` are now more precise.

- `Context.thisDiesIfThatDies` and `thatDiesIfThisDies` parameters tightened from `string` to `FormulaIdentifier` (a branded string type).
- `RemoteControl` and `RemoteControlState` interface parameters updated from `Promise<EndoGateway>` to `ERef<EndoGateway>` and `cancelled` widened from `Promise<never>` to `Promise<unknown>`.
- `EndoInspector` generic type parameter renamed from `Record` to `RecordT` to avoid shadowing the built-in `Record` utility type.

TypeScript consumers implementing or calling these interfaces may need to update their types accordingly.
