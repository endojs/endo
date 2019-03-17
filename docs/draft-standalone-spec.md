# Draft Spec for Standalone SES

In the Realms, Frozen Realms, Realms shim, and SES shim work, we've generally worked towards standardizing 
the APIs for dynamically *creating* a SES world from within a standard EcmaScript world. For IoT purposes, 
the more relevant question is: What is the resulting standard SES world, independent of whether it was created from 
within a standard ES world, or whether it was implemented directly by a standalone SES engine that supports only SES?


## Omissions and Simplifications

Since the primary purpose of the existing Realms/SES APIs and shims are to dynamically suppress parts of standard ES, 
a standalone SES engine would simply omit these elements, resulting in a simpler and smaller engine. 
Starting from standard ES, the simplification or omissions for the default configuration of SES are
   * Omit all support for sloppy mode
   * Omit everything outside the EcmaScript 2018 spec
      * In particular, omit the `import()` and `import.meta` expressions.
   * Omit annex B
   * Omit `Math.random()`
   * Omit ambient access to current date/time:
      * `Date.now()` returns `NaN`
      * `new Date()` return equivalent of `new Date(NaN)`
   * By default, omit `Intl`, the internationalization APIs
      * If included, must suppress ambient authority and non-determinism.
   * For all forms of function expressible by syntax (function, generator, async-function, async-generator)
      * *func*`.__proto__.constructor` is a function constructor that always throws. Because these function 
        constructors always throw, we do consider them to be evaluators.

We define the *shared globals* as all the standard shared globals defined above
(i.e., without `Intl` by default) + `Realm` (see below) - `eval` - `Function`. We define the 
*shared primordials* as all the objects transitively reachable from the shared 
globals. Note that no global objects or evaluators are reachable from the shared primordials.


## Additions

Some IoT configurations will omit all runtime evaluators. For standalone SES configurations that 
include runtime evaluators, they would appear as follows.

We include the portion of the Realm API for creating compartments, and for evaluating script code 
in a compartment with endowments:
   * `Realm.makeCompartment(options={})` -> aRealm instance representing a new compartment
   * `Realm.prototype.global` (a getter-only accessor) ---> global object of compartment
   * `Realm.prototype.evaluateProgram(programSrcString, endowments={})` --> completion value
      * The own properties of the endowments which are legal variable names become the const variable 
        bindings of the global lexical scope in which the program is evaluated. Unlike standard 
        EcmaScript, there is no shared global lexical scope. Each global lexical scope comes *only* 
        from the endowments.
   * `Realm.prototype.evaluateExpr(exprSrcString, endowments={})` --> value of expression
      * Given that `exprSrcString` parses as an expression,
          ```js
          aRealm.evaluateExpr(exprSrcString, endowments)
          ```
        is equivalent to 
          ```js
          aRealm.evaluateProgram(`(${exprSrcString});`, endowments)
          ```

   1. Freeze all shared primordials. With the above omissions, there is no hidden 
     state or ambient authority among the shared primordials, so transitive freezing means that the shared 
     primordials are immutable and rom-able.
   1. For each compartment, create a new global populated by:
      * The shared globals with their standard global property names.
      * An `eval` function and `Function` constructor that evaluates code in the scope of that global
         * Both this `eval` function and `Function` constructor inherit from the shared 
           %FunctionPrototype% primordial.
         * Each of these `eval` functions is considered an initial eval function for 
           purposes of determining whether an apparent direct-eval is indeed a direct-eval. 
           (The direct-eval feature is impossible to shim, and so is low priority. 
           When omitted, the direct-eval syntax should also be statically rejected.)
         * `Function.prototype` is initialized to the same %FunctionPrototype%.
      * All of these global properties are made non-configurable non-writable data properties. 
        The new per-global objects (the eval function and Function constructor) are frozen. 
        Since they have no hidden state, they are immutable and rom-able.
      * This new global object is *not* frozen. It remains extensible. However, 
        the global's [[Prototype]] slot cannot be altered.
   1. The host creates a start-compartment whose start-global is populated as above. 
   1. To that start-global object, the host adds global bindings to those host objects 
      that provide initial access to the program's outside world, e.g., the I/O environment 
      of the device.
   1. The program's start scripts are then evaluated as program code in that start-compartment.
   
Note that, in all compartment scopes, 

```js
Function !== Function.prototype.constructor
```

Each compartment scope has its own `Function`, which does evaluate. All compartment scopes share the 
same `Function.prototype` and therefore the same `Function.prototype.constructor`, which only throws.


## Work in Progress

We are still working towards specifying how SES supports modules. Indeed, this is the main 
topic of the SES-strategy sessions. Somehow, whether by import, require, or otherwise, a SES 
environment must provide access to the exports of the packages currently named 
'@agoric/nat' and '@agoric/harden', which will normally be bound to const variable 
named `Nat` and `harden`. We'll revisit all this is a separate document.

TBD:
   * `System`
      * error stacks
      * weak references
      * loader?
   * Should SES provide support for `require` and core CommonJS Modules?
   * Where should `Nat` and `harden` come from?
   * `SES`
      * `SES.confine`
 

## Stage Separated SES

Full SES supports running vetted customization code in a freezable realm prior to freezing it into a SES realm. 
Such vetted customization code runs in an environment like that described above except:
   * The shared primordials are not yet frozen
   * No host objects have been added to the global. Thus the vetted customizations run fully confined, 
     without access to any external world.

Although the custoimizations run confined, because they can arbitrarily mutate the shared primordial state 
before other code runs, all later code is fully vulnerable to these custiomizations. This is why we
refer to them as *vetted customization code*. Once the shared primordial state is transitively frozen,
then we can support the standalone SES environment described above, where compartments are units of
protection between subgraphs of mutually suspicious objects.

(A loose analogy is that vetted customizations run in an analog of Unix single-user mode, 
or that they are what a shopkeeper does to their shop in preparation for opening for business.)

In an IoT context, we should associate these two stages with build-time and runtime. The build-time 
environment should support more of the Realms and SES APIs for creating a SES world, that would be
absent from within the standalone SES world they are creating.
