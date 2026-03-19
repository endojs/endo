# Context

Okay so:
- the @endo/genie dev repl in `packages/genie/dev-repl.js`
- and the uconfined daemon plugin in `packages/genie/main.js` and `packages/genie/setup.js.js`   

# Goals

Evolve the endo plugin to be more like dev repl:
- make sure we integrate observer and reflector
  - probably factor out and generalize the reflector's `makeToolGate` utility into the genie/agent module
- special command handling: the endo plugin uses slash commands like `/heartbeat`
  - while the dev-repl uses dot commands like `.hearbeat`
  - not yet sure how well the slash commands will work inside the endo
    messaging system, so make sure we can flexible change to a different
    special character
- tool setup across all of the various `PiAgent` instances is a bit too spread
  out, even just within dev-repl, let alone inside the endo plugin; not entire
  sure what the best path is here yet

Eventually I'd even like to be able to use the dev-repl to integration test the
geneo endo plugin: so rather than running in-process genie agent + parts ( like
observer, reflector, heartbeat ) we'd just talk to a running genie plugin over
endo daemon mail messages. NOTE: currently the endo mail model does not support
progressive updates, so we'll only get final response text for now, no
visibility into tool calls, thinking, let alone progressive updates.

# Action Items

- [x] research all of the above, present options, and design what needs to be
  done in one or more `PLAN/genie_loop_*` documents
  - [x] **DO NOT** yet write code or start implementing

# Deliverables

Design landed in three peer documents under `PLAN/`:

- `PLAN/genie_loop_overview.md` — goals, non-goals, current-state diff
  of dev-repl vs main.js, proposed 4-layer architecture, phasing,
  open questions, and two drive-by syntax fixes uncovered during
  research (`main.js:610` missing `const runAgentLoop` declaration;
  `dev-repl.js:1052` `.background` special is a broken arrow-function
  with `yield` and lowercase identifiers).
- `PLAN/genie_loop_architecture.md` — detailed design + options for
  each layer:
  - tool-gate extraction (with three live bugs documented),
  - unified tool registry (`buildGenieTools`),
  - agent pack (`makeGenieAgents`),
  - specials dispatcher with prefix parameterisation (`.` vs `/`),
  - `GenieIO` adapter seam,
  - observer/reflector daemon-side parity,
  - heartbeat ownership (dedicated vs shared agent).
- `PLAN/genie_loop_remote.md` — dev-repl as an integration-test
  client against a running plugin over endo mail: transport options
  (raw mail / typed chunks / exo `followEvents` / JSONL log), phasing
  (A→B→C), and the test-harness hook point
  (`packages/genie/test/integration.sh`).

