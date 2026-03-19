# Goal: easy turn up of @endo/genie running inside a systemd-capsule, container, VM, or any other kind of remote

## Action

1. [x] review and respond/clarify/research the sketch below into a design
  - do not start coding or implementing yet
  - see [`PLAN/genie_in_bottle.md`](../PLAN/genie_in_bottle.md) §
    "Proposed architecture", "Deployment scenarios", "Isolation layers",
    "Implementation phases"

2. [x] research, report, and ask questions
  - research + report: [`PLAN/genie_in_bottle.md`](../PLAN/genie_in_bottle.md)
    § "Current state (2026-04-21)" — table of today-vs-gap citing
    `packages/daemon/index.js:443`, `daemon-node-powers.js:129/194`,
    `packages/daemon/src/networks/{tcp-netstring,setup-libp2p}.js`,
    `packages/genie/setup.js:22-70`,
    `packages/cli/src/commands/{invite,accept}.js`,
    `packages/daemon/src/host.js:793-899`.
  - open questions for humans:
    [`PLAN/genie_in_bottle.md`](../PLAN/genie_in_bottle.md)
    § "Open questions" (Q1 root-genie shape R1/R2/R3,
    Q2 same-host safety, Q3 `GENIE_MODEL` delivery,
    Q4 install channel, Q5 transport preferences,
    Q6 invite locator stdout vs file).

3. [x] write design document(s) in `PLAN/`
  - [`PLAN/genie_in_bottle.md`](../PLAN/genie_in_bottle.md) — primary design
  - related / consumer:
    [`PLAN/genie_loop_remote.md`](../PLAN/genie_loop_remote.md)

## Next

Answer the open questions in `PLAN/genie_in_bottle.md`
("Open questions" Q1–Q6) and then start on
"Implementation phases" Phase 0 (bottle shell recipe).

## Sketch

1. **where**: any ssh accessible e.g. `user@host` ; optionally `user@host:path/to/workspace`
  - something something systemd-capsule
  - something something incus... containers... micro VMs...
  - default workspace `$XDG_RUNTIME_DIR/endo/genie/workspace`

2. **install**: if `endo` is already on `$PATH` we good
  - otherwise install with something like:
    ```bash
    yarn global add <github-username>/<repo-name>#branch
    ```

2. **start**: `endo start` for now
  - opt-in to systemd when possible tho, ideally perma user unit wanted by default target
  - enable linger if we can, otherwise inform the user
  - enable system default.target wants `user@$UID.service` if we can, otherwise inform the user

3. **turnup**: network, do we need to do this snippet? or p2p?
  ```bash
  # Store the listen address so the network module can find it
  yarn exec endo store --text "127.0.0.1:8940" --name tcp-listen-addr

  # Install the network as an unconfined module (needs Node.js access for `net`)
  yarn exec endo make --UNCONFINED packages/daemon/src/networks/tcp-netstring.js --powers @agent --name network-service

  # Move to the networks directory
  yarn exec endo mv network-service NETS/tcp
  ```

4. **turnup**: basically it's @endo/genie setup -> main
  - but maybe with elevated powers since this daemon is here to be fully owned
    and operated by this root genie agent?

5. **invite**: `endo invite owner`
  - operator can now solve for network access wrt step 3 above, and do an `endo accept genie` within their daemon

## References

- `packages/daemon/MULTIPLAYER.md`
