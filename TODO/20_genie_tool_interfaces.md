# Work on @endo/genie tools

## Phase 1

Following up and carrying forward the changes that I started in git commit `336472fe7`:

1. fix the TODOs in `packages/genie/src/tools/read-file.js`:
  - [ ] complete the `@returns` type on `execute`
  - [ ] then updates the declared interface `.returns( ... )` matcher above accordingly

2. Survey all the other tools under `packages/genie/src/tools/` and make a plan below to similarly update them

**NOTE** there should be no need to perform `typeof` checking within any
`execute` implementations, that is what the `M` interface guards are ensuring.

## Phase 2

-- items from phase 1 go here --
