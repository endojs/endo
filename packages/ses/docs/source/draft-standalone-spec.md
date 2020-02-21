# Draft Spec for Standalone SES

In the Realms, Frozen Realms, Realms shim, and SES shim work, we've
generally worked towards standardizing the APIs for dynamically
*creating* a SES world from within a standard EcmaScript world. For IoT
or blockchain purposes, the more relevant question is: What is the
resulting standard SES world, independent of whether it was created from
within a standard EcmaScript world, or whether it was implemented
directly by a standalone SES engine that supports only SES?

(We use "blockchain" here as shorthand for the more general category of
deterministically replicated SES computation, whether on a blockchain,
permissioned BFT system, or whatever.)

## Omissions and Simplifications

Since the primary purpose of the existing Realms/SES APIs and shims are to
dynamically suppress parts of standard EcmaScript, a standalone SES engine
would simply omit these elements, resulting in a simpler and smaller
engine. Starting from standard EcmaScript, the simplification or omissions for
the default configuration of SES are

 * Omit all support for sloppy mode
 * Aside from `BigInt`, omit everything else outside the EcmaScript 2018 spec.
 * Omit annex B (except those our whitelist allows)
 * In particular, omit the `RegExp` static properties that provide a global
   communications channel.
 * Omit `Math.random()`
 * Omit ambient access to current date/time:
   * `Date.now()` returns `NaN`
   * `new Date()` return equivalent of `new Date(NaN)`
 * By default, omit `Intl`, the internationalization APIs
 * If some of `Intl` is included, it must suppress ambient authority and
   non-determinism.
 * For all forms of function expressible by syntax (function, generator,
   async-function, async-generator)
   * *func*`.[[Prototype]].constructor` is a function constructor that always
     throws. Because these function constructors always throw, we do not
     consider them to be evaluators.

We define the *shared globals* as all the standard shared global
variable bindings defined by the above, i.e., without `Intl` by default,
with `Realm` (see below), without `eval`, without `Function`, without
anything outside the EcmaScript 2018 spec, and with `BigInt`. We define
the *shared primordials* as all the objects transitively reachable from
the shared globals. Note that no global objects or evaluators are
reachable from the shared primordials.

## Additions

Some IoT and blockchain configurations may omit all runtime evaluators.
For standalone SES configurations that include runtime evaluators, they
would appear as follows.

1.  Include the portion of the Realm API for creating compartments, and
    for evaluating script code in a compartment with endowments:

    -   `Realm.makeCompartment(options={})` -> aRealm instance
        representing a new compartment
    -   `Realm.prototype.global` -> global object of compartment.
        This is a getter-only accessor.
    -   `Realm.prototype.evaluateProgram(programSrcString, endowments={})`
        -> completion value
        -   The own properties of the endowments which are legal
            variable names become the const variable bindings of the
            global lexical scope in which the program is evaluated.
            Unlike standard EcmaScript, there is no shared global
            lexical scope. Each global lexical scope comes *only* from
            the endowments.
    -   `Realm.prototype.evaluateExpr(exprSrcString, endowments={})`
        -> value of expression
        -   Given that `exprSrcString` parses as an expression,
            `js   aRealm.evaluateExpr(exprSrcString, endowments)` is
            equivalent to
            `js   aRealm.evaluateProgram(`(\${exprSrcString});\`,
            endowments)\`

    The additional element from the proposed Realm API is
    `Realm.makeRootRealm(options={})`. SES allows but does not require
    this static method. IoT and blockchain uses of SES generally have no
    need for multiple root realms. However, browser-based and Node-based
    use of SES will often be coupled with creating multiple confined
    root realms. On platforms that do not support `Realm.makeRootRealm`,
    the property must be absent so that SES code can feature-test for
    it.

2.  Freeze all shared primordials. With the above omissions, there is no
    hidden state or ambient authority among the shared primordials, so
    transitive freezing means that the shared primordials are immutable
    and rom-able. Since no global objects or evaluators are reachable
    from the shared primordials. They can be placed in ROM without the
    bookkeeping needed for them to point at any objects not in ROM.

3.  For each compartment, create a new global populated by:

    -   The shared globals with their standard global property names.
    -   An `eval` function and `Function` constructor that evaluates
        code in the scope of that global
        -   Both this `eval` function and `Function` constructor inherit
            from the shared %FunctionPrototype% primordial.
        -   Each of these `eval` functions is considered an initial eval
            function for purposes of determining whether a an expression
            in direct-eval syntax is indeed a direct-eval. (The
            direct-eval feature is impossible to shim and rarely needed
            anyway, and so is low priority. When omitted, the
            direct-eval syntax should also be statically rejected with
            an early error.)
        -   `Function.prototype` is initialized to point at the same
            shared %FunctionPrototype% primordial.
    -   All of these global properties are made non-configurable
        non-writable data properties. The new per-global objects (the
        eval function and Function constructor) are frozen. Since they
        have no hidden state, they are immutable and rom-able.
    -   This new global object is *not* frozen. It remains extensible.
        However, the global's \[\[Prototype\]\] slot cannot be altered.

4.  The host creates a start-compartment whose start-global is populated
    as above.

5.  To that start-global object, the host adds global bindings to those
    host objects that provide initial access to the program's outside
    world, e.g., the I/O environment of the device.

6.  The program's start scripts are then evaluated as program code in
    that start-compartment.

Each compartment scope has its own `Function`, which does evaluate. All
compartment scopes share the same `Function.prototype` and therefore the
same `Function.prototype.constructor` which is a function that only
throws. Thus, in all compartment scopes,

```javascript
Function !== Function.prototype.constructor
```

TBD:
 * What portion of the additions above are relevant to a standalone
SES without runtime evaluators?
 * Should `eval` and `Function` actually
be on a compartment's global object, or should we include them in the
compartment's global lexical scope?

## Work in Progress

We are still working towards specifying how SES supports modules.
Indeed, this is the main topic of the SES-strategy sessions. Somehow,
whether by import, require, or otherwise, a SES environment must provide
access to the exports of the packages currently named '\@agoric/nat' and
'\@agoric/harden', which will normally be bound to const variable named
`Nat` and `harden`. We'll revisit all this is a separate document.

TBD:
 * `System`
 * error stacks
 * weak references
 * loader?
 * Should
SES provide support for `require` and core CommonJS Modules?
 * Where
should `Nat` and `harden` come from?
 * `SES`
 * `SES.confine`

## Stage Separated SES

Full SES, as embedded into EcmaScript, supports running vetted
customization code in a freezable realm prior to freezing it into a SES
realm. Such vetted customization code runs in an environment like that
described above except:
 * The shared primordials are not yet frozen \*
No host objects have been added to the global. Thus the vetted
customizations run fully confined, without access to any external world.

Although the custoimizations run confined, because they can arbitrarily
mutate the shared primordial state before other code runs, all later
code is fully vulnerable to these custiomizations. This is why we refer
to them as *vetted customization code*. Once the shared primordial state
is transitively frozen, then we can support the standalone SES
environment described above, where compartments are units of protection
between subgraphs of mutually suspicious objects.

An analogy is that vetted customizations are what a shopkeeper does to
their shop in preparation for opening for business. Freezing the
primordials is the last step before opening the doors and allowing in
untrusted customers.

In an IoT context, we should associate these two stages with build-time
and runtime. The build-time environment should support more of the
Realms and SES APIs for creating a SES world, that would be absent from
within the standalone SES world they are creating. The freezing of the
primordials is the snapshotting of the post-constomization primordial
state for transfer to ROM.
