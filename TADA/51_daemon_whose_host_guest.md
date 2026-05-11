# @endo/daemon worker labels

Building on the work done in `TADA/50_daemon_worker_meta.md`:

Okay so now when we purge and restart the daemon like:
```
$ endo purge -f && endo start
endo daemon ready { type: 'ready' }
```

We now see:
```
$ endo status
pid: 73920
Running Workers:
* id:32cfde266c21564149b8102b2073fa25f2e9ba0f35407cde5df0689a2da5f839 name:host pid:73932
```

That's better, but "Who's host is that? Host of what? From What module?"

Similarly when we run LAL's setup:
```
$ yarn workspace @endo/lal run setup
Watching inbox for form from setup-lal...
Found form at message 0 — submitting...
Submitted.
```

Now we have:
```
$ endo status
pid: 73920
Running Workers:
* id:00a77d8234c99c82dfd8f1a6891cb06590bcde911720e74460ed2000979cb905 name:guest pid:74657
* id:32cfde266c21564149b8102b2073fa25f2e9ba0f35407cde5df0689a2da5f839 name:host pid:73932
* id:f91a2d8fc8b60d9e84b7035f68ea17f50adcae674a2a3c1dd60ea0873610cf23 name:guest pid:74639
```

Similar questions:
- Who's guest is that?
- Why are there 2 guests?
- Which one is which?

## TODO

- [x] further clarify the "host" and "guest" labels whenever we're creating them under the daemon

## Changes Made

Threaded descriptive worker labels through the host and guest
formulation pipeline so `endo status` shows *whose* host or guest
each worker belongs to.

### Files changed

- **`packages/daemon/src/types.d.ts`** — Added optional `workerLabel`
  field to `FormulateHostDependenciesParams`, and optional
  `workerLabel` parameter to `formulateHost`, `formulateGuest`,
  and `formulateGuestDependencies`.
- **`packages/daemon/src/daemon.js`** — `formulateHostDependencies`
  destructures and forwards `workerLabel` (defaulting to `'host'`).
  `formulateGuestDependencies` accepts and forwards `workerLabel`
  (defaulting to `'guest'`).
  `formulateHost` and `formulateGuest` accept and pass the label
  through.
- **`packages/daemon/src/host.js`** — `makeChildHost` constructs a
  label like `host:agentName` or `host:petName`.
  `makeGuest` constructs a label like `guest:agentName` or
  `guest:handleName`.

### Expected output

After purge-and-restart, `endo status` now shows:
```
* id:32cf... name:host pid:73932
```
(The default host still says `host` since no pet name is specified
at the `formulateHostDependencies` call in the endo bootstrap path.)

After running `yarn workspace @endo/lal run setup`:
```
* id:00a7... name:guest:setup-lal pid:74657
* id:32cf... name:host pid:73932
* id:f91a... name:guest:lal pid:74639
```
(Exact names depend on the pet names or agent names used by the
LAL setup script.)
