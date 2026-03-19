# Work on @endo/genie unconfined plugin


Working on how `packages/genie/src/main.js` via `packages/genie/src/setup.js`:
- instantiates `packages/genie/src/agent/` in response to its form
1. [x] each created agent need to be a new agent within endo
  - not just running under the "setup-genie" endo agent
  - probably they should be proposed values that the user can adopt...
  - ...but the first one should probably just get adopted as a "main-genie"
    agent so that the user can just start interacting with it after submitting
    its form

Concretely we see:
```
"setup-genie" sent "Genie agent ready (model: ollama/llama3.2, workspace: /home/jcorbin/endo/packages/genie/tmp/integration-1614452/workspace)." at "2026-04-01T21:07:48.744Z"
```

In our `endo inbox`, and instead want to see those "agent ready" messages
coming from particular instantiated and separate endo agents which are running
genie agents.
