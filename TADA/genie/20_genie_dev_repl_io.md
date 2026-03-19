# @endo/genie rapid development harness

Continue working on `packages/genie/dev-repl.js`.

- the repl alternates between thru to `console.log` and `process.stdout.write`, which should be unified
  1. [x] the primary `runPrompt` should change to be a string generator: `async function* runPrompt(prompt, conversationHistory)`
  2. [x] the using, currently `main`, function should then be responsible for where to write like:
    ```javascript
    // TODO this:
    for await (const line of runPrompt(commandArg, conversationHistory)) { console.log(line); }

    // instead of this:
    await runPrompt(commandArg, conversationHistory);
    ```
  3. [x] further more, most of what's in `main` right now should:
    - be factored out into a new `function *runAgent(options)` where
    - whose options pass normalized arg values
    - which yield line strings similarly to `runPrompt`
    - should be able to do a `yield* runPrompt(...)`

