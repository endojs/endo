# Endo and Hardened JavaScript (SES) Programming Guide

This is a guide to programming with *Hardened JavaScript* and *Endo*. It:
- Shows what you can and cannot do with a Hardened JavaScript program.
- Defines what SES, the Hardened JavaScript shim, is and does.
- Provides background on why JavaScript functionality was added, removed, or changed.
- Describes *realms* and *compartments*.
- Introduces Endo.

This is intended for initial reading when starting to use or learn about Agoric. For
those knowledgeable about or experienced with Hardened JavaScript, see the
[Endo and Hardened JavaScript Programming Reference](./reference.md)
for to use Hardened JavaScript without much explanation.

## What is Hardened JavaScript?

Hardened JavaScript:
- Is a JavaScript runtime library for safely running third-party code.
- Addresses JavaScript’s lack of internal security.
  - This is particularly significant because JavaScript applications
    use and rely on third-party code (modules, packages, libraries,
    user-provided code for extensions and plug-ins, etc.).
- Enforces best practices by removing hazardous features such as global
  mutable state and lack of encapsulation in sloppy mode.
- Is a safe deterministic subset of "strict mode" JavaScript.
- Does not include any IO objects that provide
  [*ambient authority*](https://en.wikipedia.org/wiki/Ambient_authority).
- Removes non-determinism by modifying a few built-in objects.
- Adds functionality to freeze and make immutable both built-in JavaScript
  objects and program created objects and make them immutable.
- Is (as SES) is a proposed extension to the JavaScript standard.

Hardened JavaScript consists of three parts:
- Lockdown is a function that irreversibly repairs and hardens an existing
  mutable JavaScript environment.
- Harden is a function that makes interfaces tamper-proof, so objects can be
  shared between programs.
- Compartment is a class that constructs isolated environments, with separate
  globals and modules, but shared hardened primordials and limited access to
  other powerful objects in global scope.

## What is SES?

SES is an old umbrella term for the Hardened JavaScript effort, and while we
refer to these specific features as Hardened JavaScript, the SES name lingers
in a few places.

SES (as `ses` in npm, the Node.js package registry) is the name of a JavaScript
library that implements the Hardened JavaScript, that works in most modern
JavaScript engines.

The SES Strategy group is a
[community](https://groups.google.com/g/ses-strategy) of developers advocating
and discussing security features for inclusion in JavaScript.

As 2021 closes at time of writing, the language proposals still bear the SES
name, though that is likely to change.

## What is Endo?

What Node.js does for JavaScript, Endo does for Hardened JavaScript.
Endo loads packages and modules in an ECMAScript module loader that isolates
every package, granting limited access to the host's resources.
Agoric smart contracts are an example of Endo guest programs.

## The Hardened JavaScript story

JavaScript was created to let web surfers safely run programs from strangers.
Web pages put JavaScript programs in a *sandbox* that restricts their abilities
while maximizing utility.

This worked well until web applications started inviting multiple strangers
into the same sandbox. But they continued to depend on a security model where
every stranger had their own sandbox.

Meanwhile, server-side JavaScript applications imbued their sandbox with unbounded
abilities and ran programs written by strangers. They were vulnerable
to both their dependencies *and* also the rarely reviewed dependencies of their dependencies.

Hardened JavaScript uses a finer grain security model, *Object Capabilities* or *OCaps*.
With OCaps, many strangers can collaborate in a single sandbox, without risking them
frustrating, interfering, or conspiring with or against the user or each other.

To do this, the Lockdown function *hardens* the entire surface of the
JavaScript environment.
*The only way a program can subvert or communicate with another program is to
have been expressly granted a reference to an object provided by that other program.*

Any programming environment fitting the OCaps model satisfies three requirements:
- Any program can protect its invariants by hiding its own data and capabilities.
- Power can only be exercised over something by having a reference to the
  object providing that power, for example, a file system object. A
  reference to a powerful object is a *capability*.
- The only way to get a capability is by being given one. For example, by receiving
  one as an argument of a constructor or method.

Ordinary JavaScript does not fully qualify as an OCaps language due to the pervasive
mutability of shared objects. You can construct a JavaScript subset with a
transitively immutable environment without any unintended capabilities. Starting
in 2007 with ECMAScript 5, Agoric engineers and the OCap community have influenced
JavaScript’s evolution so a program can transform its own environment into
this safe JavaScript environment.

As of February 2021, Hardened JavaScript (under the name SES) is making its way
through JavaScript standards committees.
It is expected to become official JavaScript when the standards process
is completed.
Meanwhile, Agoric provides its own SES *shim* (a library providing
the needed Hardened JavaScript features) for writing secure smart contracts in
JavaScript.
Several Agoric engineers are on the relevant standards committees
and are responsible for aspects of Hardened JavaScript, so our SES should be
very close to the eventual standards.

## Using Hardened JavaScript with your code

The Lockdown function transforms ordinary JavaScript environments into Hardened
JavaScript environments.

On Node.js you can import or require `ses` in either CommonJS or ECMAScript
modules, then call `lockdown()`. This is a *shim*. It mutates the environment
in place so any code running after the shim can assume it’s running in a hardened
environment. This includes the globals `lockdown()`, `harden()`, `Compartment`,
and so on. For example:
```js
require("ses");
lockdown();
```
Or:
```js
import 'ses';
lockdown();
```

To ensure a module runs in a hardened environment, wrap the above code in a `ses-lockdown.js` module and import it:
```js
import './non-ses-code-before-lockdown.js';
import './ses-lockdown.js'; // calls lockdown.
import './ses-code-after-lockdown.js';
```
To use SES as a script on the web, use the UMD build.
```js
<script src="node_modules/ses/dist/ses.umd.min.js">
```

## What Lockdown does to JavaScript

Hardened JavaScript does not include any I/O objects providing "unsafe" [*ambient authority*](https://en.wikipedia.org/wiki/Ambient_authority).
It also doesn't allow non-determinism from built-in JavaScript objects.

As of SES-0.8.0/Fall 2020, [Agoric's SES source code](https://github.com/endojs/endo/blob/SES-v0.8.0/packages/ses/src/permits.js)
defines a subset of the globals defined by the baseline JavaScript language specification. SES includes these globals:

- `Object`
- `Array`
- `Number`
- `Map`
- `WeakMap`
- `Number`
- `BigInt`
- `Intl`
- `Math` all features except
  - `Math.random()` is disabled (calling it throws an error) as an obvious source of
     non-determinism.
- `Date` all features except
  - `Date.now()` returns `NaN`
  - `new Date(nonNumber)` or `Date(anything)` return a `Date` that stringifies to `"Invalid Date"`

Much of the `Intl` package, and some other objects' locale-specific aspects (e.g. `Number.prototype.toLocaleString`)
have results that depend upon which locale is configured. This varies from one process to another.
See [`lockdown()`](./lockdown.md) for how those are handled.

Lockdown freezes *primordials*; built-in JavaScript objects such as `Object`, `Array`, and `RegExp`,
and their prototype chains. `globalThis` is also frozen. This prevents malicious code from changing their behavior
(imagine `Array.prototype.push` delivering a copy of its argument to an attacker, or ignoring
certain values). It also prevents using, for example, `Object.heyBuddy` or `globalThis.heyBuddy`
as an ambient communication channel via setting a property and another program periodically reading it.
This would violate object-capability discipline; objects may only communicate through references.

Both frozen primordials and a frozen `globalThis` have problems with a few JavaScript
libraries that add new features to built-in objects (shims/polyfills). These
libraries stretch best practices' boundaries by adding new features to built-in
objects in a way Compartments don't allow.

## What Lockdown removes from standard JavaScript

Almost all existing JavaScript code runs under Node.js or inside a browser, so
it's easy to conflate environment features with JavaScript. For example, you may
be surprised that `Buffer` and `require` are Node.js additions. Also `setTimeout()`,
`setInterval()`, `URL`, `atob()`, `btoa()`, `TextEncoder`, and `TextDecoder` are additions
to the programming environment standardized by the web, and are not intrinsic
to JavaScript.

Most Node.js-specific [global objects](https://nodejs.org/dist/latest-v14.x/docs/api/globals.html) are
**unavailable** including:

* `queueMicrotask`
* `URL` and `URLSearchParams`
* `WebAssembly`
* `TextEncoder` and `TextDecoder`
* `global`
  * Use `globalThis` instead (and remember it is frozen).
* `process`
  * No `process.env` to access the process's environment variables.
  * No `process.argv` for the argument array.
* `Buffer` (consider using `TypedArray` instead, but see below)
* `setImmediate`/`clearImmediate`
  * You can generally replace `setImmediate(fn)`
    with `Promise.resolve().then(_ => fn())` to defer execution of `fn` until after the current event/callback
    finishes processing. But it won't run until after all *other* ready Promise callbacks execute.

    There are two queues: the *IO queue* (accessed by `setImmediate`), and the *Promise queue* (accessed by
    Promise resolution). Hardened JavaScript code can add to the Promise queue, but needs to be given a
    capability to be able to add to the I/O queue. Note that the Promise queue is
    higher-priority than the IO queue, so the Promise queue must be empty for any IO or timers to be handled.
* `setInterval` and `setTimeout` (and `clearInterval`/`clearTimeout`)
  * Any notion of time must come from
    exchanging messages with external timer services (the SwingSet environment provides a `TimerService` object
    to the bootstrap vat, which can share it with other vats)

None of the huge list of [other Browser environment features](https://developer.mozilla.org/en-US/docs/Web/API)
presented as names in the global scope (some also added to Node.js) are available in a
hardened environment. The most surprising removals include `atob`, `TextEncoder`, and `URL`.

`debugger` is a first-class JavaScript statement, and behaves as expected.

## What Hardened JavaScript adds to standard Javascript

The following anticipate additional proposed standard-track features. If they become standards,
future JavaScript environments will include them as global objects. So the current Agoric SES shim
makes those global objects available.

- `console` is available for debugging. While not in the official spec, since all implementations
  add it, leaving it out would cause confusion. Note that `console.log`’s exact
  behavior is up to the host program; display to the operator is not guaranteed. Use the
  console for debug information only. The console is not obliged to write to the POSIX standard output.

- `assert` is also a debugging tool that allows programs to express assertions
  and defer the construction of error objects and computed messages until an
  assertion fails.

- `lockdown()` and `harden()` both freeze an object’s API surface (enumerable data properties).
  A hardened object’s properties cannot be changed, only read, so the only way to interact with a
  hardened object is through its methods. `harden()` is similar to `Object.freeze()` but more
  thorough. See the individual [`lockdown()`](#lockdown) and [`harden()`](#harden) sections
  below.

- [`Compartment`](https://github.com/endojs/endo/tree/SES-v0.8.0/packages/ses#compartment) is
  a global. Code runs inside a `Compartment` and can create sub-compartments to host other
  code (with different globals or transforms). Note that these child compartments get `harden()` and `Compartment`.

## Realms

Agoric deploy scripts and smart contract code run in an *immutable
realm* with *Compartments* providing just enough authority to create
useful and secure contracts. But not enough authority to do anything
unintended or harmful to the participants of the smart contract.

JavaScript code runs in the context of
a [*Realm*](https://www.ecma-international.org/ecma-262/10.0/index.html#sec-code-realms). A
realm is the set of *primordials* (objects and standard library functions
like `Array.prototype.push`) and a global object. In a web browser, an iframe is a realm.
In Node.js, a Node process is a realm.

For historical reasons, the ECMAScript specification requires primordials
be mutable (`Array.prototype.push = yourFunction` is valid ECMAScript but not
recommended). By using the Agoric SES shim and calling `lockdown()`, you can turn the
current realm into an *immutable realm*; a realm within which the primordials
are deeply frozen.

SES also lets programs create *Compartments*. These are "mini-realms".
A Compartment has its own dedicated global object and environment, but
it inherits the primordials from their parent realm. Components are described
in detail in the next section.

## Compartments

A *compartment* is an execution environment for evaluating a stranger’s code. It has
its own `globalThis` global object and wholly independent system of
modules. Otherwise it shares the same batch of intrinsics such as `Array` with its surrounding
compartment. The concept of a compartment implies an initial compartment,
the initial execution environment of a realm. After lockdown is called, all compartments share the same
frozen realm.

Here we create a compartment with a `print()` function on `globalThis`.
```js
import 'ses';

const c = new Compartment({
  print: harden(console.log),
});

c.evaluate(`
  print('Hello! Hello?');
`);
```
This new compartment has a different global object than the start compartment. We
posit that all JavaScript executes in a realm and compartment. Every realm has
distinct intrinsics, whereas every compartment shares intrinsics. The initial
realm and compartment are not constructed with `new Realm()` or `new Compartment()` but
that’s invisible to the code running; they could just as well be running within
a constructed realm or compartment.

We call the one compartment in a realm that was not expressly constructed the start
compartment. The start compartment receives some ambient authorities from the host,
often access to timers and IO that are denied to other compartments. Running lockdown
does not erase these powerful objects, but puts the program running in the start
compartment on a footing where it is possible to carefully delegate powers to child
compartments.

The global object is initially mutable. Locking down the realm hardened the objects in
global scope. After lockdown, no compartment can tamper with these intrinsics and
undeniable objects. Many of these are identical in the new compartment.

```js
const c = new Compartment();
c.globalThis === globalThis; // false
c.globalThis.JSON === JSON; // true
```

Other pairs of compartments also share many identical intrinsics and undeniable objects
of the realm. Each has a unique, initially mutable, global object.
```js
const c1 = new Compartment();
const c2 = new Compartment();
c1.globalThis === c2.globalThis; // false
c1.globalThis.JSON === c2.globalThis.JSON; // true
```
Every compartment's global scope includes a shallow, specialized copy of the JavaScript
intrinsics. These omit `Date.now()` and `Math.random()`
since they can be covert inter-program communication channels.

However, a compartment may be expressly given access to these objects through
the compartment constructor's first argument or by assigning them to the
compartment's `globalThis` after construction.
```js
const powerfulCompartment = new Compartment({ Math });
powerfulCompartment.globalThis.Date = Date;
```

When you create a new `Compartment` object, you must decide if it supports OCaps security.
If it does, run `harden(compartment.globalThis)` on it before loading any untrusted code into it.

A single compartment can run a JavaScript program in the locked-down environment.
However, most interesting programs have multiple modules. So, each compartment also has
its own module system. SES version 0.8.0 adds support for ECMAScript modules,
a relatively new system supported by many browsers, and officially released in Node.js 14.

Compartments can be linked, so one compartment can export a module that another compartment
imports. Each compartment may have its own rules for how to resolve import specifiers and
how to locate and retrieve modules. In the following example, we use the compartment constructor to
create two compartments: one for the application and another for its dependency.

The `resolveHook` is synchronous and determines how to compute the full module specifier
for a partially resolved module specifier in ESM source text, like `import "./even.js"` as
it appears in `./math/odd.js` corresponds to `./math/even.js` in a Node.js program.

The `importHook` is asynchronous and responsible for for locating, retrieving, and parsing
modules. Retrieving is getting the source text from the web, archive, or database based on
its location. Converting a module specifier to a location is an internal concern of
the `importHook` and the particular storage medium for the module texts, but should generally
be a URL and may appear in stack traces. The `importHook` may use the `ModuleStaticRecord`
constructor to create a reusable, parsed representation of the module text.

```js
const dependency = new Compartment({}, {}, {
  resolveHook: (moduleSpecifier, moduleReferrer) =>
    resolve(moduleSpecifier, moduleReferrer),
  importHook: async moduleSpecifier => {
    const moduleLocation = locate(moduleSpecifier);
    const moduleText = await retrieve(moduleLocation);
    return new ModuleStaticRecord(moduleText, moduleLocation);
  },
});
const application = new Compartment({}, {
  'dependency': dependency.module('./main.js'),
}, {
  resolveHook,
  importHook,
});
```
Compartments provide a low-level loader API for JavaScript modules.
Your code might run in compartments, but they are an implementation
detail of tools and runtimes.

Vats in the Agoric runtime use compartments to isolate contracts within a vat.
A vat can use multiple compartments.
MetaMask’s LavaMoat uses a Compartment for every module, to create
boundaries between application code and third-party dependencies.

The lifetime of a compartment is bounded by garbage collection and the
lifetime of the realm that contains them. You will not ever have to tear
down or delete one.

## `lockdown()`

`lockdown()` freezes all JavaScript defined objects accessible to any
program in the execution environment. Calling `lockdown()` turns a JavaScript
system into a hardened system, with enforced OCap (object-capability) security. It
alters the surrounding execution environment (realm) such that no two
programs running in the same realm can observe or interfere with each other
until they have been introduced.

To do this, `lockdown()` tamper-proofs all of the JavaScript intrinsics to prevent
prototype pollution. After that, no program can subvert the methods of these objects
(preventing some man in the middle attacks). Also, no program can use these mutable
objects to pass notes to parties that haven't been expressly introduced (preventing
some covert communication channels).

For a full explanation of `lockdown()` and its options, please click
[here](./lockdown.md).

## `harden()`

`harden()` is automatically provided by `lockdown()`. Any code that will run inside a vat or a
contract can use harden as a global, without importing anything. The Agoric programming
environment defines objects (`mint`, `issuer`, `zcf`, etc.) that shouldn't need hardening
as their constructors do that work. You mainly need to harden records, callbacks, and ephemeral objects.

`harden()` must be called on all objects that will be transferred across a trust boundary
The general rule is if you make a new object and give it to someone else (and don't
immediately forget it yourself), you should give them `harden(obj)` instead of the raw object.
This ensures other objects can only interact with them through their defined method interface,
i.e. the functions in the object's API. *CapTP*, our communications layer for passing
references to distributed objects, enforces this at vat boundaries.

Hardening an instance also hardens its class.

You can send a message to a hardened object. If it's a record, you can access
its properties and their values. Being hardened doesn't preclude an object from having
access to mutable state (`harden(new Map())` still behaves like a normal mutable `Map`),
but it means their methods stay the same and can't be surprisingly changed by someone else.

> Tip: If your text editor/IDE complains about `harden()` not being defined or imported,
> try adding `/* global harden */` to the top of the file.
>
> You use `harden()` like this:
> ```js
> const o = {a: 2};
> o.a  = 12;
> console.log(o.a); // 12 because o is still mutable
> harden(o);
> o.a  = 37; // throws a TypeError because o is now hardened
> ```
## `lockdown()` and `harden()`

`lockdown()` and `harden()` essentially do the same thing; freeze objects so their
properties cannot be changed. The only way to interact with frozen objects is through
their methods. Their differences are what objects you use them on, and when you use them.

`lockdown()` **must** be called first. It hardens JavaScript's built-in *primordials*
(implicitly shared global objects) and enables `harden()`. If you call `harden()`
before `lockdown()` executes, it throws an error.

`lockdown()` works on objects created by the JavaScript language itself as part of
its definition. Use `harden()` to freeze objects created after `lockdown()`was called;
i.e. objects created by programs written in JavaScript.

## Library compatibility

Programs running under SES can use `import` or `require()` to import other libraries consisting
only of SES-compatible JavaScript code. This includes a significant part of the NPM registry.

However, many NPM packages use built-in Node.js modules. If used at import time (in their top-level
code), hardened JavaScript code cannot use the package and fails to load at all. If they use the built-in
features at runtime, then the package can load. However, it might fail later when an invoked function
accesses the missing functionality. So some NPM packages are partially compatible;
usable if you don't invoke certain features.

The same is true for NPM packages that use missing globals, or attempt to modify frozen primordials.

The [Endo wiki](https://github.com/endojs/endo/wiki) tracks compatibility reports for NPM packages,
including potential workarounds.

## HTML comments

JavaScript parsers may not recognize HTML comments within source code, potentially causing different
behavior on different engines. For safety, the Agoric SES shim rejects any source code containing a comment
open (`<!--`) or close (`-->`) sequence. However, its filter uses a regular expression, not a full
parser. It unnecessarily rejects any source code containing either of the strings `<!--` or `-->`,
even if neither marks a comment.

### Dynamic import expressions

The "dynamic import expression" (`import('path')`) enables code to load dependencies at
runtime. It returns a promise resolving to the module namespace object. While it takes
the form of a function call, it's actually not a function call, but is instead JavaScript
syntax. As such it would let vat code bypass the shim's `Compartment`'s module map.
For safety, the SES shim rejects code that looks like it uses a dynamic import expression.

The regular expression for this pattern is safe and should never allow any use of
dynamic import, however obfuscated the usage is. Because of this, it may be confused
into falsely rejecting legitimate code.

For example, the word “import” near a parenthesis or at the end of a line inside a
comment is identified as a disallowed use of `import()` and falsely rejected:
```js
//
// This function calculates the import
// duties paid on the merchandise..
//
```

But the following obfuscated dynamic import usage is rightly rejected:
```js
sneaky = import
// comment to hide invocation
(modulename);
```

## Direct vs. indirect eval expressions

A *direct eval*, invoked as `eval(code)`, behaves as if `code` were expanded in place. The
evaluated code sees the same scope as the `eval` itself sees, so this `code` can reference `x`:

```js
function foo(code) {
  const x = 1;
  eval(code);
}
```

If you perform a direct eval, you cannot hide your internal authorities from the code being evaluated.

In contrast, an *indirect eval* only gets the global scope, not the local scope. In a hardened
environment, indirect eval is a useful and common tool. The evaluated code can only access global
objects, and those are all safe (and frozen). The only bad thing an indirect eval can do is consume
unbounded CPU or memory. Once you've evaluated the code, you can invoke it with arguments to give it
as many or as few authorities as you like.

The most common way to invoke an indirect eval is `(1,eval)(code)`.

The Hardened JavaScript proposal does not change how direct and indirect eval work. However, the SES shim
cannot correctly emulate a direct eval. If it tried, it would perform an indirect eval.
This could be pretty confusing, because the evaluated code would not use objects from
the local scope as expected. Furthermore, in the future when Hardened JavaScript is natively implemented
by JavaScript engines, the behavior would revert to direct eval, allowing access to
anything in scope.

To avoid this confusion and compatibility risk, the shim uses a regular expression to
reject code that looks like it is performing a direct eval. This regexp is not complete
(you can trick it into allowing a direct eval), but that’s safe because it really performs
an indirect eval. Our goal is just to guide people away from confusing and non-compliant
behaviors early in their development process.

This regexp falsely rejects occurrences inside static strings and comments.
