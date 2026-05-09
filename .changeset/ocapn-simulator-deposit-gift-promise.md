---
'@endo/ocapn': minor
'@endo/ocapn-simulator': minor
---

- Add a new private `@endo/ocapn-simulator` package: a browser-based playground that runs N OCapN clients in web workers, brokered by a `MessagePort`-based netlayer with simulated latency. Useful for hands-on experimentation with the `op:flush` / `op:flush-done` proposal.
- Re-export `encodeSwissnum` and `locationToLocationId` from `@endo/ocapn` so external clients (e.g. the simulator) can build sturdyrefs and refer to peer sessions without reaching into internal subpaths.
- Allow `bootstrap.deposit-gift` to accept a promise as the gift value, in addition to a remotable. This unblocks third-party promise handoffs of unresolved answer-promises across the network — the natural shape of forwarder chains that return `[answerPromise]` to keep the chain visible as a `desc:import-promise`. Previously such gifts rejected with "Gift must be remotable" the first time a hop tried to ship its answer to a third party.
