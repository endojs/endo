TODO endonym, exonym, pronouns of the user

# Endo CLI

The Endo command line is a user interface for managing the Endo application
runner (daemon).
This includes managing the lifecycle of the daemon process.

# Examples

# Reference

## endo start | stop | restart

Starts, stops, or restarts the Endo daemon.

## endo clean

Erases the user's Endo UNIX domain socket which may have lingered due to an
abrupt exit and must be erased to restart.

## endo reset

Clears the user's Endo cache, state, and socket, including logs and the last
known Endo daemon PIDs.

## endo spawn

## endo eval

## endo store

## endo cat

## endo show

## endo where

Reveals the conventional location for your Endo state, ephemeral state, cache,
log, socket or named pipe given your platform and environment.

## endo log

Shows the tail of the Endo Daemon log and optionally follows the log.
Shells out to `tail`.

## endo ping

Attempts to send a message to and receive a response from your Endo daemon.

## endo map

Generates a compartment map for a JavaScript application from files laid out
according to Node.js conventions.

## endo hash

## endo hash-archive

## endo archive

# Files

```
$STATE/
  endo.log
  pet-name/$PET_NAME.json
  value-uuid/$VALUE_UUID.json
  store-sha512/$STORE_SHA512
  worker-uuid/$WORKER_UUID/
    worker.log
$RUN/
  endo.pid
  captp0.sock
  worker-uuid/$WORKER_UUID/
    worker.pid
```

## `$STATE/endo.log`

## `$RUN/endo.pid`

## `$RUN/captp0.pid`

## `$STATE/pet-name/$PET_NAME.json`

## `$STATE/value-uuid/$VALUE_UUID.json`

## `$STATE/store-sha512/$STORE_SHA512`

## `$STATE/worker-uuid/$WORKER_UUID/worker.log`

## `$RUN/worker-uuid/$WORKER_UUID/worker.pid`

## `$STATE/worker-uuid/$WORKER_UUID/ref-name/$REF_NAME.json`

# Design
