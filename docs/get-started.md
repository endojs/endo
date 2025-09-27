---
title: get-started
group: Documents
category: Guides
date: 2025-09-24
---

# Getting Started with Endo


## Introduction

Endo is a framework for powerful JavaScript plugin systems and supply chain
attack resistance.
Endo includes tools for _confinement_, _communication_, and _concurrency_.
With Endo’s [SES][] implementation of [HardenedJS][], we can opt-in to a more
tamper-resistant mode of JavaScript.
With Endo’s [E][]

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

## Core Concepts

HardenedJS introduces three components to the base JavaScript:

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

## Installing Endo

To get started with Endo today, you will need a supported version of
[Node.js][] and one of its suitable package managers like `npm` or `yarn`.
If you are working inside the Endo project, you will specifically need `yarn`.

[Node.js]: https://nodejs.org/

## First Steps: Introducing HardenedJS

Endo includes an [shim][] implementation of HardenedJS called [SES][].
By importing `ses` and calling `lockdown()`, we can transform ordinary
JavaScript to HardenedJS.

To begin, create a Node.js project where modules are ESM format by default.

```shell
mkdir my-first-endo
cd my-first-endo
echo '{"type": "module"}' > package.json
npm init --yes
npm install ses
```

Then add a program, `index.js`.

```js
import 'ses';

lockdown();
const compartment = new Compartment();
const four = compartment.evaluate('2 + 2');
console.log(four);
```

In this program, we have frozen the _shared intrinsics_, created a
_compartment_, and evaluated a trivial program.
Compartments also support modules and hide the real global object,
so we can do a great deal more.
But, we do not ordinarilly use compartment directly.
Endo includes utilities that can load and evaluate whole Node.js-style
applications off a filesystem or out of a zip file, which in principle
be adapted to any storage medium or used to improvize different bundle formats.

To better understand what this application achieves, add some instrumentation
and experiment with what kinds of operations are possible inside
and outside a compartment.

For example, compartments are not whole realms.
The intrinsics inside and outside a compartment are the same,
but have been adjusted so that they cannot be used to escape a compartment.

```js
import 'ses';

lockdown();

console.log('intrinsics are frozen',
    Object.isFrozen(Object.prototype));
const compartment = new Compartment();
console.log('intrinsics are the same inside compartments',
    compartment.evaluate('[]') instanceof Array);
console.log('the Function constructor is different, though',
    compartment.evaluate('Function') !== Function);
console.log('the Function.prototype is the same',
    compartment.evaluate('Function') instanceof Function);
console.log('new functions are stuck in the compartment',
    compartment.evaluate(`new Function("return globalThis")()`)
    === compartment.globalThis);
console.log('the constructor on Function.prototype is not Function',
    compartment.evaluate('Function.prototype.constructor !== Function'));
console.log('the constructor on Function.prototype is not the real Function',
    compartment.evaluate('Function.prototype.constructor') !== Function);
console.log(`it throws an error so compartments can't be escaped`);
try {
  compartment.evaluate(`new Function.prototype.constructor()`);
} catch {
  console.log('true');
}
```

The global object in a compartment has only shared intrinsics and
per-compartment evaluators by default.
We can inject globals to give the compartment capabilities.
The `lockdown` function incidentally makes `console` safe to share
with compartments, but compartments do not get that capability by default.

```js
import 'ses';

lockdown();

const compartment = new Compartment({
  __options__: true,
  globals: { console },
});
compartment.evaluate('console.log("Hello")');
```

Compartments can also load modules and you can read more about
the full Compartment API in the documentation for [SES][].

## Confining Node.js-style applications

Endo provides both high-level and low-level tools for creating and executing
bundles out of Node.js packages and their transitive dependencies.
The low-level tools give you more flexibility for storage and creating
new bundle formats.

In this example, we will use the high-level tools to create
and then execute a bundle in compartments.

First, create a plugin to bundle up. This is `hello.js`.

```js
console.log("Hello, World!");
```

```
npm install @endo/bundle-source
npm exec bundle-source hello.js > hello.json
```

You have now created a bundle called `hello.json` that, incidentally, is a JSON
envelope around a base64 encoded Zip file.

```
jq -r .endoZipBase64 hello.json | base64 -d > hello.zip
unzip -d hello hello.zip
```

The interior of the Zip file is a `compartment-map.json` that describes the
internal linkage of the bundle and then a file for each pre-compiled module.

```
Archive:  hello.zip
 extracting: hello/compartment-map.json
 extracting: hello/my-first-endo-v1.0.0/hello.js
```

> The pre-compiled module format is a regrettable aberration we look forward to
> removing when we the proposal for `Compartment` if the JavaScript standards
> committee sees fit to advance [our proposal](https://github.com/endojs/proposal-module-global) into the
> language.
> We have already made tremendous progress advancing other components of
> HardenedJS like `Object.freeze`, and `ModuleSource`.

To use the bundle, we need the corresponding Endo runtime.

```
npm install @endo/import-bundle
```

So, now we can run the bundle in compartments with another small program.

```js
import 'ses';
import helloBundle from './hello.json' with { type: 'json' };
import { importBundle } from '@endo/import-bundle';

lockdown();

await importBundle(helloBundle, {
  endowments: { console },
});
```

## Distributed Programming with Endo

Endo also provides tools that let programmers communicate between processes
and over networks with asynchronous, object-oriented message passing.
This is not merely RPC.
With a _Capability Transfer Protocol_, we can serialize references
to remote objects without moving their state, and we can
[pipeline](https://en.wikipedia.org/wiki/Futures_and_promises#Promise_pipelining)
invocations through a locally pending promise for a remote reference.

The heart of this abstraction is _eventual send_, which generalizes promises so
that messages can pass through a pending _handled promise_ for a remote
reference.
In this example, we send three method invocations immediately and wait once for
the final result.
With this form, we can interact with remote objects without any degree of
coupling to the specific protocol used to communicate with the remote side.

```js
const promise1 = E(remote1).method1();
const promise2 = E(promise1).method3();
await E(promise2).method3();
```

For a concrete protocol, we provide `@endo/captp` and are participating
in the development of a new protocol, [OCapN][].

> Other _capability transfer protocols_ include
> [Cap’n Proto](https://capnproto.org/),
> [Cap’n Web](https://github.com/cloudflare/capnweb),
> and the original [CapTP from the E programming language](http://erights.org/elib/distrib/captp/index.html).

We can demonstrate CapTP locally by creating a message pipe between two
parties, Alice and Bob, in a single process.
We will need some kit.

```
npm install @endo/init
npm install @endo/captp
npm install @endo/stream
npm install @endo/eventual-send
npm install @endo/exo
npm install @endo/patterns
```

- `@endo/init` is a thin wrapper around `ses` that ensures that `lockdown` gets
  as part of the initialization of this module, so every subsequent module can
  use the HardenedJS base environment.
- `@endo/captp` is our protocol, but is not coupled to a particular transport
  layer, so you can run it over `WebSocket`, `MessagePort`, or any other
  message framing protocol.
- `@endo/stream` is a utility for connecting async iterators, included here
  just to emulate a duplex connection locally.
- `@endo/eventual-send` lets us send messages to targets.
- `@endo/exo` lets us make targets that can receive messages.
- `@endo/patterns` lets us define schemas for targets and validate them at
  runtime.
  This greatly reduces the target's burden to defend against misshapen
  arguments.

In the program, we have separate sections for Alice and Bob, which you can
imagine to be in different processes or connected only through a network.
Some low-level machinery moves messages between them.
Alice defines a _bootstrap_ object which is the first target that Bob can
send messages to when they're connected.

In this example, Alice implements `ping` and Bob invokes `ping` remotely.

```js
import '@endo/init';
import { makeCapTP } from '@endo/captp';
import { makePipe } from '@endo/stream';
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { E } from '@endo/eventual-send';

// Construct a fake duplex connection
const [fromAlice, toBob] = makePipe();
const [fromBob, toAlice] = makePipe();

// Define the valid method invocation patterns of Alice targets.
const AliceShape = M.interface('Alice', {
  ping: M.call().returns(),
});

// This is Alice's program, where she provides a Pinger.
(async function makeAlice() {
  const bootstrap = makeExo('Alice', AliceShape, {
    ping() {
      console.log('Ping!');
    },
  });

  // This bit of machinery pumps messages through the pipes above.
  const send = message => {
    toBob.next(message);
  };
  const { dispatch, abort } = makeCapTP('alice', send, bootstrap);
  for await (const message of fromBob) {
    dispatch(message);
  }
})();

(async function makeBob() {
  // Bob's CapTP message pump.
  const send = message => {
    toAlice.next(message);
  };
  const { dispatch, getBootstrap, abort } = makeCapTP('alice', send);
  (async () => {
    for await (const message of fromAlice) {
      dispatch(message);
    }
  })();

  // We get the first (and currently only) target exported
  // by Alice.
  const alice = getBootstrap();

  // And we invoke its one method. Ping!
  await E(alice).ping();
})();
```

This system eliminates the need for ad-hoc message protocols for the control
plane between processes or in distributed systems and frees the developer to
design secure protocols with _objects_ and _interfaces_, while retaining
the expressivity of object oriented programming.
The protocol naturally multiplexes messages from any process to any object.
Additionally, OCapN enables us to introduce references to third-party
capabilities, such that connections between peers are created and destroyed
automatically, securely, and on-demand.

We expect this programming model to enable JavaScript programs to more readilly
harness local parallism and also compose much more easily and safely express
policy in distributed systems.

## Use Cases

Endo's most dedicated users are the
[Agoric](https://github.com/Agoric/agoric-sdk) smart contract platform and
MetaMask, which uses Endo both for its _Snaps_ plugin system and to defend
itself from supply chain attacks, from its build pipeline to its production web
extensions with [LavaMoat](https://github.com/lavamoat/lavamoat).

Parts of Endo are useful for other distributed and decentralized systems.

With Endo, we are also building a platform for safely distributing applications
and capabilities between peer to peer user agents includes a _petname system_
tentatively called the [Pet Dæmon][], a [command line interface][CLI], and a
planned _Familiar_ desktop application.
We hope for this to serve as a backbone for a rich capability ecosystem.

## Resources & Next Steps

Please join the conversation on our [Mailing List][SES Strategy Group] and
[Matrix][].
Open a [Discussion][], perhaps to solicit feedback on your design!
Reach out if you would like an ivitation to our **meetings**:

The Endo repository is [endojs/endo](https://github.com/endojs/endo) on Github.

Welcome to our vibrant community.
Please experiment with the Endo framework and let's foster _fearless
coöperation_ together.

[Discussion]: https://github.com/endojs/endo/discussions
[SES Strategy Group]: https://groups.google.com/g/ses-strategy
[SES Strategy Recordings]: https://www.youtube.com/playlist?list=PLzDw4TTug5O1jzKodRDp3qec8zl88oxGd
[shim]: https://en.wikipedia.org/wiki/Shim_(computing)
[SES]: https://github.com/endojs/endo/tree/master/packages/ses#ses
[HardenedJS]: https://hardenedjs.org
[E]: https://github.com/endojs/endo/tree/master/packages/eventual-send#eventual-send
[supply chain attacks]: https://en.wikipedia.org/wiki/Supply_chain_attack
[Principle of Least Authority]: https://en.wikipedia.org/wiki/Principle_of_least_privilege
[Object-capability Model]: https://en.wikipedia.org/wiki/Object-capability_model
[OCapN]: https://ocapn.org
[Encapsulation]: https://en.wikipedia.org/wiki/Encapsulation_(computer_programming)
[Petname system]: https://en.wikipedia.org/wiki/Petname
[Zooko's triangle]: https://en.wikipedia.org/wiki/Zooko's_triangle
[Matrix]: https://matrix.to/#/#endojs:matrix.org
[CLI]: https://github.com/endojs/endo/tree/packages/cli
[Pet Dæmon]: https://github.com/endojs/endo/tree/packages/daemon
