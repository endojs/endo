# Work on @endo/genie unconfined plugin


Working on how `packages/genie/src/main.js` via `packages/genie/src/setup.js`:
1. [x] can we get rid of the `activeAgents` map?
  - the config may suggest a name, sure
  - but then that name gets proposed to the user when the resulting form value
    is returned; user's final adoption of the agent instance to a particular
    name is authority, not any map we keep outside of the endo pet namespace
  - **Done:** removed `activeAgents` Map entirely; `spawnAgent` already
    handles idempotent guest creation via `E(hostAgent).has(agentName)`,
    so the endo pet namespace is now the sole authority on existence.

2. [x] agents should only know about sub-agents they've spawned, and only then
  through lookup via the end pet namespace ; plan that out as a next step, in a
  follow-up `TODO/...` named similarly to this one ; but do not start coding
  this implementation yet
  - **Done:** design plan written in `TODO/21_genie_scoped_agent_visibility.md`.

3. [x] can we make the expected type of `agentPowers` more concrete? `any` is a particularly useless type...
  - **Done:** replaced `any` with `FarEndoGuest` (from `@endo/daemon/src/types.js`)
    for `guestPowers`, `agentPowers` parameters and the `agentGuest` local.
    Also typed `hostAgent` as `FarRef<EndoHost>`.  Removed the `/** @type {any} */`
    cast on `powers`.
