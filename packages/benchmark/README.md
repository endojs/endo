# `@endo/benchmark`

This package just provides a minimalistic ava-like interface to run benchmark tests. 

## How to run locally
Run the command `yarn test` in the `packages/benchmark` folder.

## Pre-reqs of running `yarn test`
### Install [`esvu`](https://www.npmjs.com/package/esvu) globally 
Select the `v8` and `xs` from CLI so that it can download the binaries of those engines. 

### Install [`eshost-cli`](https://www.npmjs.com/package/eshost) globally.
Run the following commands to configure the binaries of engines with `eshost`.
* `eshost --add "v8" d8 "$HOME/.esvu/engines/v8/d8"`
* `eshost --add "xs" xs "$HOME/.esvu/engines/xs/xst"`

Now you are good to go to run `yarn test`