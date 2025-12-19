---
title: readme
group: Documents
category: Guides
---

# Endo

[![contributing][contributing-svg]][contributing-url]
[![license][license-image]][license-url]
[![CI status](https://github.com/endojs/endo/actions/workflows/ci.yml/badge.svg)](https://github.com/endojs/endo/actions/workflows/ci.yml)
[![Mutable.ai Auto Wiki](https://img.shields.io/badge/Auto_Wiki-Mutable.ai-blue)](https://wiki.mutable.ai/endojs/endo)

Endo is a framework for powerful JavaScript plugin systems and supply chain
attack resistance.
Endo includes tools for _confinement_, _communication_, and _concurrency_.
With Endo’s [SES][] implementation of [HardenedJS][], we can opt-in to a more
tamper-resistant mode of JavaScript.
With Endo’s [Eventual Send][E], we have a safe, transport-agnostic abstraction
for pipelining messages to remote procedures, and concrete transports like
[Endo CapTP][CapTP] and, soon, [OCapN](https://ocapn.org).

[Agoric][] and [MetaMask][] rely on Hardened JavaScript and the [SES shim][SES]
as part of systems that sandbox third-party plugins or smart contracts and
mitigate supply chain attacks for production web applications, web extensions,
and build systems.

[![Agoric Logo](https://github.com/endojs/endo/raw/master/packages/ses/docs/agoric-x100.png)][Agoric]
[![MetaMask Logo](https://github.com/endojs/endo/raw/master/packages/ses/docs/metamask-x100.png)][MetaMask]

[Agoric]: https://agoric.com/
[MetaMask]: https://metamask.io/

Endo protects program integrity both in-process and in distributed systems.
Hardened JavaScript protects local integrity, defending an application against
[supply chain attacks][]: hacks that enter through upgrades to third-party
dependencies.
Endo does this by encouraging the [Principle of Least Authority][] and
providing foundations for the [Object-capability Model][].

The _Principle of Least Authority_ states that a software component should only
have access to data and resources that enable it to do its legitimate work.
The _Object-capability Model_ gives programmers a place to reason, by
construction, about how permission flows through a program using
well-understood mechanisms like [Encapsulation][].

For distributed systems, Endo stretches object oriented programming over
networks using asynchronous message passing to remote objects with
_Capability Transport Protocols_ like [OCapN][] and a portable abstraction
for safely sending messages to remote objects called _Eventual Send_.

**Security:** Security-conscious JavaScript applications can use these
components to improve the integrity and auditability of their own applications,
improve the economics of vetting third-party dependencies, and mitigate runtime
prototype pollution attacks.

**Workers and Networks:** Performance-conscious JavaScript applications can use
these components to improve the ergonomics of message-passing between
components in separate workers.
Endo's _Eventual Send_ and _Capability Transport Protocols_ stretch
asynchronous method invocation acrosses processes and networks.

**Plugins:** JavaScript platforms on the web and blockchains can rely on Endo to safely
enable third-party plugins or smart contracts.
Endo provides tooling for bundling and safely executing arbitrary programs in
the presence of hardened platform objects.

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

## Core Concepts

[HardenedJS][] introduces three components to the base JavaScript:

- Lockdown
- Harden
- Compartment

The _Shared Intrinsics_ are a subset of the JavaScript intrinsics like the
`Array` and `Object` prototypes that, after _locking down_, are safe to share
between programs running in _compartments_.
After _lockdown_, programs can use _harden_ to make other objects safe
to share between compartments.

With these three components, we can begin to rely on certain guarantees:

- Hardened objects can represent _capabilities_.
  That is, holding a reference to an object means you can use that object.
- JavaScript itself guarantees that _capabilities_ cannot be forged.
  That is, a useful reference cannot be obtained by guessing its address.
- JavaScript also enforces certain structures like closures and `WeakMap`
  can guard capabilities. 
- The only way to obtain a _capability_ is to have received it as an argument,
  return, global, or module of the surrounding compartmnet.
- Once hardened, an object and its methods cannot be altered.

This gives us the foundation of the _Object-capability_ security paradigm,
or simply "OCaps".
From this point forward, any interesting policy can be created with code.

We can then use Endo to stretch references to Object-capabliities between
processes and over networks.
Instead of relying on the memory-safety of JavaScript, we then rely on
cryptography to preserve confidentiality and unforgeability of references.  A
suitably large, signed, cryptographically random number, reachable over a
network over an encrypted connection, may safely designate a capability.

Then, Endo puts ocaps directly into the hands of users with an example [Petname
system][] called the _Pet Dæmon_, so user's can send, receive, and use
_Object-capabilities_ with human-meaningful names.

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

<a name="§pola"></a>
### Principle of Least Authority

The Principle of Least Authority [(Wikipedia)][Principle of Least Authority]
states that a software component should only have access to data and resources
that enable it to do its legitimate work.

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

[CapTP]: packages/captp/README.md#endocaptp
[E]: https://github.com/endojs/endo/tree/master/packages/eventual-send#eventual-send
[Encapsulation]: https://en.wikipedia.org/wiki/Encapsulation_(computer_programming)
[Endo Matrix]: https://matrix.to/#/#endojs:matrix.org
[Endo Sync]: https://www.youtube.com/watch?v=tM5NyB7xxYM&list=PLzDw4TTug5O0eUj81Vnkp-mFuI4O0rBnc
[Handled Promise]: packages/eventual-send/README.md
[HardenedJS]: https://hardenedjs.org
[LavaMoat]: https://github.com/LavaMoat/LavaMoat
[OCapN]: https://ocapn.org
[Object-capability Model]: https://en.wikipedia.org/wiki/Object-capability_model
[Petname system]: https://en.wikipedia.org/wiki/Petname
[Principle of Least Authority]: https://en.wikipedia.org/wiki/Principle_of_least_privilege
[SES Proposal]: https://github.com/tc39/proposal-ses
[SES Strategy Group]: https://groups.google.com/g/ses-strategy
[SES Strategy Recordings]: https://www.youtube.com/playlist?list=PLzDw4TTug5O1jzKodRDp3qec8zl88oxGd
[SES]: packages/ses/README.md
[TG3]: https://github.com/tc39/tg3
[contributing-svg]: https://img.shields.io/badge/PRs-welcome-brightgreen.svg
[contributing-url]: ./CONTRIBUTING.md
[license-image]: https://img.shields.io/badge/License-Apache%202.0-blue.svg
[license-url]: ./LICENSE
[supply chain attacks]: https://en.wikipedia.org/wiki/Supply_chain_attack
