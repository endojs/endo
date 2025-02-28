# `@endo/benchmark`

This package just provides a minimalistic ava-like interface to run benchmark tests. 

## How to run locally
Run the command `yarn test` in the `packages/benchmark` folder.

## Pre-reqs of running `yarn test`
Run the command `yarn install-engines` in the `packages/benchmark` folder. This command will install the `eshost` and `esvu`. 
* `esvu` is used to insall the binaries of `v8` and `xs` engines
* `eshost` is used to configure the binaries of engines