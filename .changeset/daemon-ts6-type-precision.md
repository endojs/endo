---
'@endo/daemon': patch
---

TypeScript 6 conformance: public types in `types.d.ts` are now more precise.

- `Context.thisDiesIfThatDies` and `thatDiesIfThisDies` parameters tightened from `string` to `FormulaIdentifier` (a branded string type).
- `RemoteControl.accept`/`connect` and `RemoteControlState.accept`/`connect` take `remoteGateway: ERef<EndoGateway>` (was `Promise<EndoGateway>`); `RemoteControl.connect` now returns `ERef<EndoGateway>` (was `Promise<EndoGateway>`); `RemoteControlState.connect` returns `{ state; remoteGateway: ERef<EndoGateway> }`.
- `EndoInspector` generic type parameter renamed from `Record` to `RecordT` to avoid shadowing the built-in `Record` utility type; `lookup` and `list` now use method syntax so that `EndoInspector<'some literal'>` remains assignable to `EndoInspector<string>` under `strictFunctionTypes`.

TypeScript consumers implementing or calling these interfaces may need to update their types accordingly.
