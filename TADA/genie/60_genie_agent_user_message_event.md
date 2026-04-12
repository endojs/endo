# Work on @endo/genie — refactor agent to provide UesrMessage

- [x] modify `ChatEvent` defined in `packages/genie/src/agent/index.js` to have
  a `UserMessage` variant, with typedef and `makeUserMessage` constructors similar to the others

- [x] the key place to create events from is around line 556 under `runAgentRound`

- [x] update `packages/genie/dev-repl.js` accordingly: the TODO around line 118 can now be done
