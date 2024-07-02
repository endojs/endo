#  Endo

[![build status][ci-svg]][ci-url]
[![contributing][contributing-svg]][contributing-url]
[![license][license-image]][license-url]

Endo is a framework for powerful JavaScript plugin systems and supply chain
attack resistance.
Endo includes tools for _confinement_, _communication_, and _concurrency_.
These include a shim for [Hardened JavaScript][SES], an [ECMA TC-39
standards track proposal][SES Proposal] to make JavaScript a safer and more
suitable platform for plugin systems.

Agoric and MetaMask rely on Hardened JavaScript and the [SES shim][SES] as part
of systems that sandbox third-party plugins or smart contracts and mitigate
supply chain attacks for production web applications, web extensions, and build
systems.

[![Agoric Logo](packages/ses/docs/agoric-x100.png)](https://agoric.com/)
[![MetaMask Logo](packages/ses/docs/metamask-x100.png)](https://metamask.io/)

Endo protects program integrity both in-process and in distributed systems.
Hardened JavaScript protects local integrity, defending an application against
[supply chain attacks][]: hacks that enter through upgrades to third-party
dependencies.
Endo does this by encouraging the [Principle of Least Authority](#PoLA).

Since most JavaScript libraries receive powerful capabilities from global
objects like `fetch` or modules like `net`, [LavaMoat][] generates reviewable
policies that determine what capabilities will be distributed to third party
dependencies according to evident need, and enforces those policies at runtime
with Endo.

For distributed systems, Endo stretches object oriented programming over
networks using asynchronous message passing to remote objects with the
[Handled Promise][] API and a [Capability Transfer Protocol][CapTP].

Between remote objects and Hardened JavaScript compartments, Endo makes
distributed programs easy to program, and easy to reason about integrity.
CapTP frees the programmer from needing to create bespoke communication
protocols over message ports or byte streams.

Endo combines these components to demonstrate their use for a confined plugin
system in the [Endo Pet-name Dæmon](packages/daemon) and its
[CLI](packages/cli).

Please join the conversation on our [Mailing List][SES Strategy Group] and
[Matrix][Endo Matrix].
Reach out if you would like an ivitation to our **meetings**:

- We record a weekly [Endo Sync video call][Endo Sync] .
- We recorded a weekly [SES video call][SES Strategy Recordings] with the
  Hardened JavaScript engineering community.
- We now meet weekly with [ECMA TC-39 ECMAScript Technical Committee TG-3
  Security Working Group][TG3].

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

### Principle of Least Authority

The Principle of Least Authority [(Wikipedia)][PoLA] states that a software
component should only have access to data and resources that enable it to do
its legitimate work.

**PoLA explained in 3 minutes:**
_Opening Statement on SOSP 50th Anniversary Panel_, Mark Miller:

[![Video presentation explaining PoLA in 3 minutes](https://img.youtube.com/vi/br9DwtjqmVI/0.jpg)](https://www.youtube.com/watch?v=br9DwtjqmVI)

**PoLA explained in 15 minutes:**
_Navigating the Attack Surface to achieve a multiplicative reduction in risk_,
Mark Miller:

[![Video presentation explaining PoLA in 15 minutes](https://img.youtube.com/vi/wW9-KuezPp8/0.jpg)](https://www.youtube.com/watch?v=wW9-KuezPp8&t=664s)

### Bug Disclosure

Please help us practice coordinated security bug disclosure, by using the
instructions in our [security guide](./packages/ses/SECURITY.md) to report
security-sensitive bugs privately.

For non-security bugs, please use the [regular Issues
page](https://github.com/Agoric/SES-shim/issues).

### License

Endo and its components are [Apache 2.0 licensed][license-url].

[CapTP]: packages/captp/README.md#agoriccaptp
[Endo Matrix]: https://matrix.to/#/#endojs:matrix.org
[Endo Sync]: https://www.youtube.com/watch?v=tM5NyB7xxYM&list=PLzDw4TTug5O0eUj81Vnkp-mFuI4O0rBnc
[Handled Promise]: packages/eventual-send/README.md
[LavaMoat]: https://github.com/LavaMoat/LavaMoat
[PoLA]: https://en.wikipedia.org/wiki/Principle_of_least_privilege
[SES Proposal]: https://github.com/tc39/proposal-ses
[SES Strategy Group]: https://groups.google.com/g/ses-strategy
[SES Strategy Recordings]: https://www.youtube.com/playlist?list=PLzDw4TTug5O1jzKodRDp3qec8zl88oxGd
[SES]: packages/ses/README.md
[ci-svg]: https://github.com/Agoric/SES-shim/workflows/CI/badge.svg?branch=master
[ci-url]: https://github.com/Agoric/SES-shim/actions?query=workflow%3ACI
[contributing-svg]: https://img.shields.io/badge/PRs-welcome-brightgreen.svg
[contributing-url]: ./CONTRIBUTING.md
[license-image]: https://img.shields.io/badge/License-Apache%202.0-blue.svg
[license-url]: ./LICENSE
[supply chain attacks]: https://en.wikipedia.org/wiki/Supply_chain_attack
[TG3]: https://github.com/tc39/tg3
