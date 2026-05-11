# @endo/daemon worker labels


## Phase 1: prior work

- at least name into worker state dir so that `runningWorker` can provide labels under status
- [x] investigate the actual daemon implementation in `packages/daemon/src/daemon-node.js` and `packages/daemon/src/daemon-node-powers.js`
  - [x] find where it spawns workers, then report here and update this Task with what can be done to provide visibility
- [x] add `label` field to `WorkerFormula` type (`types.d.ts`)
- [x] thread `label` through `makeIdentifiedWorker`, `formulateNumberedWorker`, `formulateWorker`, `provideWorkerId`, `formulateCapletDependencies`, `formulateUnconfined`, `formulateBundle`, `formulateEval`
- [x] write `worker.meta.json` (with `label` and `createdAt`) into worker state dir in `makeWorker` (`daemon-node-powers.js`)
- [x] pass worker pet name as `label` from host-level formulation (`host.js`)
- [x] read `worker.meta.json` in `runningWorker` factory (`index.js`) and expose `meta` property
- [x] display label in `endo status` output (`index.js` status function)

### Files changed
- `packages/daemon/src/types.d.ts` — added `label?` to `WorkerFormula`, `DaemonicControlPowers.makeWorker`, `DaemonCore.formulateWorker`, `formulateUnconfined`, `formulateBundle`
- `packages/daemon/src/daemon-node-powers.js` — accept `label`, write `worker.meta.json`
- `packages/daemon/src/daemon.js` — thread `label` through worker formulation and evaluation paths
- `packages/daemon/src/host.js` — extract worker pet name and pass as `label`
- `packages/daemon/index.js` — read `worker.meta.json` in `runningWorker`, display label in status

## Implementation summary

Workers now write a `worker.meta.json` file to their persistent state directory (`{statePath}/worker/{workerId}/worker.meta.json`) at spawn time. The file contains:

```json
{
  "createdAt": "2026-03-19T...",
  "label": "my-worker"
}
```

The `label` originates from the pet name provided when creating a worker (via `provideWorker`, `makeUnconfined`, `makeBundle`, or `evaluate` in `host.js`). It flows through the formula system as an optional `label` field on `WorkerFormula`.

`endo status` now prints worker labels alongside IDs and PIDs:
```
* id:abc123... name:my-worker pid:456
```

## Phase 2: fix (some) `<untitled>` labels

- [x] diagnose why all workers showed `<untitled>` labels
- [x] fix type signature: add `workerLabel?: string` to `formulateEval` in `types.d.ts`
- [x] fix system worker labels in `daemon.js`:
  - [x] `formulateEndo`: default host worker now labeled `'host'`
  - [x] `formulateHostDependencies`: host worker via `provideWorkerId` now labeled `'host'`
  - [x] `formulateGuestDependencies`: guest worker now labeled `'guest'`
- [x] fix user-created worker labels in `host.js` when no explicit `--worker-name`:
  - [x] `evaluate`: derives label as `'eval:<resultName>'` or `'eval'`
  - [x] `makeUnconfined`: derives label as `'<resultName>'` or `'unconfined:<specifier>'`
  - [x] `makeBundle`: derives label as `'<resultName>'` or `'bundle:<bundleName>'`

### Root cause

Three categories of bugs caused all workers to show `<untitled>`:

1. **System workers** (created during `formulateEndo`, `formulateHostDependencies`, `formulateGuestDependencies`) called `formulateNumberedWorker()` or `provideWorkerId()` without any label argument, defaulting to `'<untitled>'`.
2. **User workers without explicit `--worker-name`**: When the user runs `endo eval`, `endo make unconfined`, etc. without `--worker-name`, `workerName` is `undefined`. `prepareWorkerFormulation(undefined, ...)` returns `workerLabel: undefined`. This `undefined` then propagated through `provideWorkerId → formulateNumberedWorker` where the default `'<untitled>'` kicked in.
3. **Type signature mismatch**: `formulateEval` in `types.d.ts` was missing the `workerLabel` parameter (had 7 params, implementation had 8).

### Files changed (Phase 2)
- `packages/daemon/src/types.d.ts` — added `workerLabel?: string` to `formulateEval`
- `packages/daemon/src/daemon.js` — added labels to system worker creation: `'host'` for host workers, `'guest'` for guest workers
- `packages/daemon/src/host.js` — derive labels from context (`resultName`, `specifier`, `bundleName`) when no explicit worker name given

## Phase 3: labels still could be clearer

Okay the changes made in phase 2 certainly helped *some*:
```
Running Workers:
* id:6e2a86f5954f7cd5c5ce1f007c86611d5e072cef0c156a5a51ca14495c0a9e4f name:host pid:2164799
* id:6eb966aadfc501778ad42b515af789fac6f79bb1abd18f4daf8c2da888ea8df4 name:guest pid:2165450
* id:a51917d04bf9f457f3c6d12a3ead0310395bdc171d1f73299ace967456e52c33 name:<untitled> pid:2164806
```

- [x] chase more label passing up the chain from the `'host'` and `'guest'` labels in `packages/daemon/src/daemon.js`
- [x] fix three `formulateEval` calls in `host.js` missing `workerLabel` parameter
- [x] thread guest label through `formulateGuestDependencies` → `formulateGuest` for per-guest worker names
- [ ] the 3rd worker above that is still `<untitled>` is from @endo/lal's setup — needs manual testing to identify

### Changes (Phase 3)

#### Fixed missing `workerLabel` in three `formulateEval` calls (`host.js`)

Three call sites called `formulateEval` with only 6 of 8 parameters, omitting `pin` and `workerLabel`:

1. **`approveEvaluation`** — now passes `workerLabel = explicitLabel ?? 'eval:approval'`
2. **`endow`** — now passes `workerLabel = explicitLabel ?? (resultName ? 'endow:<resultName>' : 'endow')`
3. **`grantEvaluate` → `executeEval`** — now passes `workerLabel = explicitLabel ?? 'eval:grant'`

#### Threaded guest labels through `formulateGuestDependencies` (`daemon.js`)

- `formulateGuestDependencies` now accepts optional `guestLabel` parameter (default: `'guest'`)
- `formulateGuest` now accepts and forwards optional `guestLabel`
- `providePowersId` (implicit guest creation) passes `'guest:implicit'`
- `makeGuest` in `host.js` passes `'guest:<handleName>'` (e.g., `'guest:lal'`)
- Updated `types.d.ts` for both `formulateGuestDependencies` and `formulateGuest`

### Files changed (Phase 3)
- `packages/daemon/src/host.js` — added `workerLabel` to three `formulateEval` calls; pass guest name to `formulateGuest`
- `packages/daemon/src/daemon.js` — added `guestLabel` parameter to `formulateGuestDependencies` and `formulateGuest`; label implicit guests as `'guest:implicit'`
- `packages/daemon/src/types.d.ts` — added `guestLabel?` to `formulateGuestDependencies` and `formulateGuest`

## Testing

- NOTE: without a unit test for this, the only way to really check is to run `endo purge -f && endo start && endo status`
  - a useful third test worklet can be loaded by running `yarn workspace @endo/lal run setup` after such a purge and restart
