# Tor netlayer setup (prospective)

This document describes the environment a future OCapN Tor netlayer in this
package will expect. No Tor netlayer is implemented yet; the TCP testing
netlayer in `tcp-test-only.js` is the only transport currently shipped. The
intent here is to pin down the operator-facing setup now so the eventual
implementation — and interop with Goblins, which already ships a Tor netlayer
— has a stable target.

For context on the equivalent Goblins setup, see Racket Goblins §5.3.1
"Launch a Tor Daemon for Goblins" in the `goblins` docs.

## Model

OCapN peers do not manage Tor themselves. A single Tor daemon runs "as your
user" and every local OCapN process — the Endo peer, the Python test suite,
Goblins, a Dart peer — connects to the same daemon over its control and SOCKS
sockets. The netlayer asks Tor to create ephemeral onion services for listen
addresses and dials peer onion hints through the SOCKS port.

This matches the Goblins approach so interop experiments can share one daemon.

## Prerequisites

- `tor` on the `PATH`.
- Write access to a cache directory for Tor state and sockets. The paths below
  assume `~/.cache/ocapn/tor/` — pick whatever you like, the netlayer will
  accept an override.

## Config template

Replace `<user>` with your username. Save as `~/.config/ocapn/tor-config.txt`
(or anywhere — the path is only a convention):

```
DataDirectory /home/<user>/.cache/ocapn/tor/data/

SocksPort unix:/home/<user>/.cache/ocapn/tor/tor-socks-sock RelaxDirModeCheck

ControlSocket unix:/home/<user>/.cache/ocapn/tor/tor-control-sock RelaxDirModeCheck

Log notice file /home/<user>/.cache/ocapn/tor/tor-log.txt
```

Create the directories Tor will write into:

```sh
mkdir -p ~/.cache/ocapn/tor/data
```

## Launch

```sh
tor -f ~/.config/ocapn/tor-config.txt
```

Leave it running. Any number of OCapN processes can share it.

## Sharing a daemon with Goblins

A Goblins daemon configured per the Racket docs points at
`~/.cache/goblins/tor/{data,tor-socks-sock,tor-control-sock}`. You have two
options:

1. **Separate daemons** — run the Goblins one *and* an OCapN one on different
   socket paths. Cheap, but wastes a process.
2. **Shared daemon** — point both stacks at the same control and SOCKS
   sockets. Pick one path set (Goblins' or OCapN's), drop the other config,
   and pass the chosen paths into the OCapN netlayer options. Preferred for
   interop testing against Goblins peers such as `racket-goblin-chat`.

## Expected netlayer API (not yet implemented)

Sketch only — the actual constructor will mirror `makeTcpTestOnlyNetlayer` in
`tcp-test-only.js`:

```js
makeTorNetlayer({
  controlSocketPath: '~/.cache/ocapn/tor/tor-control-sock',
  socksSocketPath:   '~/.cache/ocapn/tor/tor-socks-sock',
  // optional: reuse Goblins' paths when sharing a daemon
});
```

Locations will serialize as `ocapn://<onion>.onion` hints, matching the
sturdyrefs Goblins prints from `onion-gui-server.rkt`.

## Future work

- A launcher script (the Racket docs mention a `raco` launcher as a TODO) that
  writes the config, creates directories, and starts `tor` in one step. An
  equivalent `node` or shell helper in this package would spare readers this
  document.
- Conformance runs of `ocapn/ocapn-test-suite` over the Tor netlayer against
  both the Endo peer and a Goblins peer, to validate parity with the TCP
  testing netlayer.
