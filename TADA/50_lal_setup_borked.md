# LAL fails to setup since recent daemon refactorings

## Investigate this error from running `@endo/lal` package

When running `endo run --UNCONFINED packages/lal/setup.js --powers AGENT`

We see:

```
CapTP cli exception: (RemoteTypeError(error:captp:Endo#20001)#1)
RemoteTypeError(error:captp:Endo#20001)#1: target has no method "provideGuest", has ["__getInterfaceGuard__","__getMethodNames__","adopt","copy","define","deliver","dismiss","dismissAll","evaluate","followLocatorNameChanges","followMessages","followNameChanges","form","handle","has","help","identify","list","listIdentifiers","listLocators","listMessages","locate","lookup","lookupById","makeDirectory","move","reject","remove","reply","request","requestEvaluation","resolve","reverseIdentify","reverseLocate","reverseLookup","send","sendValue","storeValue","submit","write"]

  at decodeErrorCommon (packages/marshal/src/marshal.js:307:24)
  at decodeErrorFromCapData (packages/marshal/src/marshal.js:335:14)
  at decodeFromCapData (packages/marshal/src/encodeToCapData.js:385:27)
  at fromCapData (packages/marshal/src/marshal.js:399:23)
  at CTP_RETURN (packages/captp/src/captp.js:784:24)
  at dispatch (packages/captp/src/captp.js:863:7)
  at packages/daemon/src/connection.js:108:7

(RemoteTypeError(error:captp:Endo#20001)#1)
CapTP cli exception: (RemoteTypeError(error:captp:Endo#20001)#1)
(RemoteTypeError(error:captp:Endo#20001)#1)
```

- [x] report back here on what the problem might be
- [x] if the fix is simple, do it

## Root Cause

Two issues caused by the refactoring from uppercase special names (`AGENT`, `HOST`)
to `@`-prefixed lowercase special names (`@agent`, `@host`):

1. **CLI `run.js` missing `AGENT`/`@agent` power level**: The `run` command only
   recognized `@none`, `@host`, and `@endo` as special powers names. When
   `--powers AGENT` was passed, it fell through to `E(agent).provideGuest('AGENT')`,
   which created a Guest — not a Host. The setup script then tried to call
   `provideGuest()` and `makeUnconfined()` on that Guest, which doesn't have those
   methods (they're Host-only).

2. **`introducedNames` using old `AGENT` key**: `setup.js` had
   `introducedNames: { AGENT: 'host-agent' }` but the host's pet store uses `@agent`
   (lowercase, `@`-prefixed). `petStore.identifyLocal('AGENT')` returned `undefined`,
   silently skipping the name introduction, so the lal guest never got access to
   `host-agent`.

## Fix Applied

- **`packages/cli/src/commands/run.js`**: Added `@agent` and `AGENT` as aliases for
  `@host` in the powers resolution logic.
- **`packages/lal/setup.js`**: Changed `introducedNames` key from `AGENT` to `@agent`
  to match the daemon-node.js auto-provisioning code.
