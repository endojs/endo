# 🚧 Endo 🚧 

[![build status][ci-svg]][ci-url]
[![contributing][contributing-svg]][contributing-url]
[![license][license-image]][license-url]

Endo is a JavaScript platform 👷‍♀️*under development*🏗 for secure communication
among objects within one process and distributed between mutually suspicious
machines.
The foundation of Endo is [SES][], a tamper-proof JavaScript environment that
allows safe execution of arbitrary programs in Compartments.

⚠️Endo is not Done. All following statements about Endo are aspirational.⚠️

Most JavaScript libraries built for Node.js, either in CommonJS or ECMAScript
module format, are suitable for running in Endo without modification, since
such programs rarely tamper with global scope or shared intrinsic objects.
The exception is shims, which require special treatment and express consent to
work with Endo.

Endo protects program integrity both in-process and in distributed systems.
SES protects local integrity, defending an application against [supply chain
attacks][]: hacks that enter through upgrades to third-party dependencies.
Endo does this by encouraging the [Principle of Least Authority][POLA].

Since most JavaScript libraries receive powerful capabilities from global
objects like `fetch` or modules like `net`, Endo uses [LavaMoat][] to
automatically generate reviewable policies that determine what capabilities
will be distributed to third party dependencies.

For distributed systems, Endo stretches object oriented programming over
networks using asynchronous message passing to remote objects with the
[Handled Promise][] API and a [Capability Transfer Protocol][CapTP].

Between remote objects and SES compartments, Endo makes distributed programs
easy to program, and easy to reason about integrity.  CapTP frees the
programmer from needing to create bespoke communication protocols over message
ports or byte streams.

Please join the conversation on our [Mailing List][SES Strategy Group] and
[Matrix][Endo Matrix].
We record a [weekly conference call][SES Strategy Recordings] with the Hardened
JavaScript engineering community.

[SES]: packages/ses/README.md
[Handled Promise]: packages/eventual-send/README.md
[CapTP]: packages/captp/README.md#agoriccaptp
[LavaMoat]: https://github.com/LavaMoat/LavaMoat
[POLA]: https://en.wikipedia.org/wiki/Principle_of_least_privilege
[supply chain attacks]: https://en.wikipedia.org/wiki/Supply_chain_attack
[Endo Matrix]: https://matrix.to/#/#endojs:matrix.org
[SES Strategy Group]: https://groups.google.com/g/ses-strategy
[SES Strategy Recordings]: https://www.youtube.com/playlist?list=PLzDw4TTug5O1jzKodRDp3qec8zl88oxGd

## Ruminations on the Name

* In Greek, "endo-" means "internal" or "within".
  This is fitting because Endo runs Node _within_ a safe sandbox.
  This is fitting in turn because Endo is built on the legacy of Google Caja.
  In Spanish, "caja" means "box" and is related to the Latin word "capsum" and
  English "capsule", as in "encapsulate".
* Endo is an anagram of Node and Deno.
  That is to say, we are not Done yet.
* The `endo` command, like the `sudo` command, is a "do" command.
  However, instead of escalating privilege, it attenuates privilege.
* Endo lets applications endow packages with limited powerful objects and
  modules.  As they say, you can't spell "endow" without "endo"!
* So, "E.N.Do" forms the acronym "Encapsulated Node Do".

So, just as "soo-doo" (super user do) and "soo-doh" (like "pseudo") are valid
pronunciations of `sudo`, "en-doh" and "en-doo" are both valid pronunciations of
`endo`.

### Bug Disclosure

Please help us practice coordinated security bug disclosure, by using the
instructions in our [security guide](./packages/ses/SECURITY.md) to report
security-sensitive bugs privately.

For non-security bugs, please use the [regular Issues
page](https://github.com/Agoric/SES-shim/issues).

### License

Endo and its components are [Apache 2.0 licensed][license-url].

[ci-svg]: https://github.com/Agoric/SES-shim/workflows/CI/badge.svg?branch=master
[ci-url]: https://github.com/Agoric/SES-shim/actions?query=workflow%3ACI
[contributing-svg]: https://img.shields.io/badge/PRs-welcome-brightgreen.svg
[contributing-url]: ./CONTRIBUTING.md
[license-image]: https://img.shields.io/badge/License-Apache%202.0-blue.svg
[license-url]: ./LICENSE
