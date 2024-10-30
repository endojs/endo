
# Hardened JavaScript on `test262`

This package includes Endo's internal tooling for verifying feature parity of
Hardened JavaScript between various platforms, and regression testing among
versions on specific platforms.

For example,
- `hardened262` can reveal the extent to which `ses` on Node.js and plain XS
  agree on the definition of Hardened JavaScript.
- `hardened262` can verify that XS with the `ses` shim, XS with an XS-specific
  version of the `ses` shim, and Node.js with the `ses` shim behave the same
  way for scenarios important for backward compatibility on the Agoric chain.

## Usage

The `scripts/test.js` tool accepts command line flags and zero or more test
file paths.

* `--flag <flag>`. Each test includes `flags` in its front-matter that may
  indicate whether it is expected to pass  under certain circumstances like
  `noStrict` or `onlyStrict`.
  The test runner will generate every combination and filter them by these
  flags.
  Specifying additional flags will suppress certain combinations.
* `--agent` causes the tool to run only this agent, or these agents if
  specified more than once.
* `--json` causes the tool to generate a machine-readable report without
  interleaving test output.
* `--list` causes the tool to generate a list of the requested combinations
  delimited with colons.
* `--list --json` causes the tool to generate a list of combinations in JSON
  format, including all the properties of each test, including their content.

## Flags

Based on the precedent of filtering tests based on flags in their front-matter
like `noStrict` and `onlyStrict`, this test runner additionally supports `no` and `only`
flags for:

- The mode, like `onlyStrict` or `noSloppy`,
- Any of the agents, like `noXs` or `onlySesNode`,
- Lockdown scenarios like `noLockdown` or `onlyLockdown`,
- Compartment scenarios like `noCompartment` or `onlyCompartment`,
- The combination of lockdown and compartment, like `onlyLockdownCompartment`,
  which is the only combination under which guest code is expected to execute
  in Hardened JavaScript.

`only*` for an unrecognized agent or test case dimension matches no tests.

## Baseline

The `scripts/baseline.sh` tool generates a `baseline` tree we use to make
deliberate forward progress on passing tests, which is verified under
continuous integration.
This provides a facility similar to marking tests as `failed` in Ava.
We expect tests that are passing in the baseline to continue to pass under
maintenance.
Any deliberate regression must be evident to change reviewers.
The files ending with `-ok` are lists of tests that pass under the named conditions.
The files ending with `-ko` (knock out!) are tests that are failing.
The names `-pass` and `-fail` would be less cute without reduction in legibility
and you are welcome to suggest changes.

## Suitability of `test262-harness`

Creating this harness proved more economical that adapting
[test262-harness](https://github.com/tc39/test262-harness)
to our needs:

- Where `test262-harness` gets leverage annotating tests that are
  expected to pass or fail in sloppy versus strict mode.
  This gave us a precedent for annotating tests for a cross-product
  in more dimensions including Hardened JavaScript's
  post-lockdown mode and within-compartment modes.
  To that end, `hardened262` builds a much larger cross-product of
  dimensions.
- To accommodate various combinations along these dimensions, 
  we need different engine adapters ("agents") and each engine
  may support different set of combinations of dimensions.
  For example, the `ses` shim on Node.js really needs to be
  imported with the host module system and can't be suitably
  emulated by stuffing it into a preamble script, especially
  the `ModuleSource` shim since that entrains Babel.
- We consequently need more ways to filter cases, so we can
  quickly iterate on solutions for particular combinations.

