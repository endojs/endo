# Logging Errors

Summary
   * Writing defensive programs under SES requires carefully considering what an error reveals to code positioned to catch those errors up the call chain.
   * To that end, SES introduces an `assert` global with functions that add to errors annotations that will be hidden from callers. SES also tames the `Error` constructor to hide the `stack` to parent callers when possible (currently: v8, SpiderMonkey, XS).
   * SES tames the global `console` and grants it the ability to reveal error annotations and stacks to the actual console.
   * Both `assert` and `console` are  powerful globals that SES does not implicitly carry into child compartments. When creating a child compartment, add `assert` to the compartment’s globals. Either add `console` too, or add a wrapper that annotates the console with a topic.
   * SES hides annotations and stack traces by default. To reveal them, SES uses mechanisms like `process.on("uncaughtException")` in Node.js to catch the error and log it back to the `console` tamed by `lockdown`.

We refer to the enhanced `console`, installed by default by the ses shim, as the *causal console*, because the annotations it reveals are often used to show causality information. For example, with the [`TRACK_TURNS=enabled`](https://github.com/Agoric/agoric-sdk/blob/master/docs/env.md#track_turns) and [`DEBUG=track-turns`](https://github.com/Agoric/agoric-sdk/blob/master/docs/env.md#debug) environment options set
```sh
# in bash syntax
export DEBUG=track-turns
export TRACK_TURNS=enabled
```
the @endo/eventual-send package will use annotations to show where previous `E` operations (either eventual sends or `E.when`) in previous turns *locally in the same vat* caused the turn with the current error. This is sometimes called "deep asynchronous stacks".
   * In the scope of the Agoric software ecosystem, this architecture will allow us to eventually introduce a more powerful distributed causal `console` that can meaningfully capture stack traces for a distributed debugger, based on the design of [Causeway](https://github.com/Agoric/agoric-sdk/issues/1318#issuecomment-662127549).


## Goals, non-goals, and partial goals

Aside from IDE-based debuggers, the normal JavaScript developer debugging experience rests on the interplay of three widespread building blocks:
   * Thrown errors which carry stack traces and explanatory messages.
   * An `assert` convenience library for turning violated conditions into diagnostic errors.
   * A built-in `console` for producing diagnostic logging information for the developer to look at, or even, in the browser, interact with.

We are building a distributed secure JavaScript system running on both blockchain and non-chain platforms. Blockchains require determinism, so all validators reproduce the same computation. Despite these constraints&mdash;secure, distributed, deterministic&mdash;we wish to provide the JavaScript developer with a debugging experience at least on par with their current `console` based expectations, and as familiar as possible, so they can hit the ground running.

The logging systems described at [survey of logging frameworks - Issue #1318](https://github.com/Agoric/agoric-sdk/issues/1318) mostly have very different goals: to produce symbolic records to be post-processed into useful diagnostic information. We still need such a logging system in addition to the system described here. The `console` directly produces information for the developer to look at and possibly interact with. Producing this experience severely constrains the additional symbolic information we can include to aid post-processing, if this additional information would add distracting visual noise.

## Configuration variations

This directory is a system of three related abstractions:
   * `Error` Errors carry hidden diagnostic information.
   * `assert` Assertions cause and annotate errors.
   * `console` Consoles show an enhanced view of logged errors.

This system must behave well in a variety of configurations:
   * After `lockdown` is imported but before repairs.
      * `assert` added to global scope of start compartment.
   * After repair or `lockdown()` in the start compartment
      * All combinations of relevant `lockdown` taming options (`errorTaming` and `consoleTaming`).
   * In *created compartments*, i.e., non-start compartments created after `lockdown()`. In our recommended practice, typically
      * All created compartments implicitly share the same safe `Error` constructor.
      * All compartments explicitly share the same `assert`.
      * Each compartment explicitly has its own `filteringConsole` in a tree, enabling filtering by compartment (topic-like) and severity level (`debug`, `log`, `info`, `warn`, and `error`).

Of these configurations, we are primarily concerned with the post-lockdown, default-safe-taming options, created compartment, recommended endowment pattern. This one must have strong simple security and determinism properties. Variations must differ in understandable ways.

## Hiding and Revealing Local Diagnostic Information

A pervasive concern is hiding diagnostic information&mdash;both for confidentiality and for deterministic replay. Code that obtains access to an error object, for example by catching it, should not have access this hidden diagnostic information. However, the console system produces logging output, typically for human developers to look at to help track down problems. The `console` interface should ideally be a write-only interface when considered by itself. We consider the viewer of log information produced by the console the way we consider the operator of a debug interface of an IDE. We view both as at a meta-level outside the computational system producing the diagnostic information. This system has several categories of hidden diagnostic information:
   * **Error stacks**. JavaScript errors capture the callstack at the time an error was created. In normal unsafe JavaScript this is available from error objects themselves via `error.stack`. This general availability violates caller encapsulation, threatening security. The contents of these callstacks are unspecified, non-deterministic, and differ from engine to engine, threatening determinism.
   * **Detailed error message data**. JavaScript errors carry a `message` string determined when the error is created, and used to convey further diagnostic information to human developers. However, data dependent values that a human developer may find useful may also reveal information that should not be accessible to code from the error object. Our `assert` provides a `details` template literal tag for creating informative error messages made visible on the logging output, but partially censored in the `message` string carried by error objects.
   * **Error annotations**. An error can indicate problems at multiple levels of abstraction. An error thrown by low level code may be diagnostic of a problem explained in low level concepts. A higher level caller may wish to add an explanation in terms of its own higher level concepts. However, if it mearly catches the low level error and then throws a high level error, the low level information is lost. Instead, the catch clause can annotate the low level error with high level diagnostic information and then rethrow the low level error.

All the above forms of diagnostic information&mdash;error stacks, detailed error messages data, error annotations&mdash;are kept in side tables, hidden from normal code, but used by the console system to display a more informative error log. All these tables are per-realm rather than per-compartment, so an error thrown by code in compartment A, annotated by code in compartment B, and logged by code in compartment C will be displayed or not only according to the compartment C console's filters. The compartment of origin of the other information is irrelevant. In support of this, there is normally only one global safe `Error` constructor shared by all created compartments, one global `assert` shared by all compartments, and one *root* console, which is the console of the start compartment. The `Error` constructor system shares the stack trace side table with the root console. The `assert` shares the detailed message data and annotation side tables with the root console.

To minimize visual noise, none of the following directly produces any logging output: throwing errors, assertion failure, or error annotation. They record information silently, only to be displayed if reached from an explicit `console` logging action. These logging actions are the root of a graph of this additional accumulated information. The logging action arguments include errors. These errors have both a detailed message that include errors, and detailed message annotations that include errors. Those errors likewise... The console logs this extra information once, with a unique tag per error. Any further occurrences of that error output that unique tag, from which to look up such previous log output.

Before repair or `lockdown`, we assume there is some prior "system" console bound to the global `console` in the start compartment. `{ consoleTaming: 'unsafe' }` leaves this unsafe system console in place. This system console is completely ignorant of the extra information in these side tables, which is therefore never seen. This includes the hidden data in the detailed messages. Instead, the system console shows the abbreviated `message` text produced by the `details` template literal that omits censored data. When combined with the default `{ errorTaming: 'safe' }`, the system console may not see error stack information. The `{ errorTaming: 'unsafe' }` or `{ errorTaming: 'unsafe-details' }` setting does not remove error stacks from error objects, in which case the system console will find it as usual.

The default `{ consoleTaming: 'safe' }` setting replaces the system console with a root console that does use all these side tables to generate a more informative log. This root console wraps the prior system console. This root console outputs its log information only by invoking this wrapped system console, which therefore determines how this log information is made available to the external world. To support determinism, we will also need to support a no-op console setting, as explained at [deterministic handling of adversarial code calling console.log with a Proxy #1852](https://github.com/Agoric/agoric-sdk/issues/1852) and [Need no-op console setting for determinism #487](https://github.com/Agoric/SES-shim/issues/487).

SES considers both `assert` and `console` to be powerful objects, appearing initially in the start compartment, and not permitted for implicit propagation to created compartments. Rather, we recommend an endowment pattern where the global `assert` is passed forward as-is, but only filtered forms of the `console` are. As compartments create each other in a tree, they create a corresponding filtering tree of consoles. Information sent to any compartment's console is then sent up the filtering tree. Only information that survives all the filters in its path arrive at the root console, producing log output. The others have no effect. Given the expected pattern of a compartment per package, the per-compartment console filter is effectly a topic filter, treating the package identity as a topic. We plan to also support coordinated stack-frame filters, as explained at [Need source-prefix-based stackframe filter #488](https://github.com/Agoric/SES-shim/issues/488).

For security and determinism, we normally reason from the *in-band frame of reference* where the console logging output does not exist, is not an effect, and `console` operations are write-only. Within this frame of reference, the `assert` and `console` powers are not very powerful. They are almost as safe as the permitted, powerless, shared primordials, which is why we're willing to recommend this endowment pattern be habitual.

## Hiding and Revealing Distributed Diagnostic Information

This section explains our *plans* to build a distributed logging experience on top of this system. Also tracked at [Support stack-tracking serialization of error objects #1863](https://github.com/Agoric/agoric-sdk/issues/1863).

Only a local system will have a meaningful notion of "the developer" that should see all hidden diagnostic information. Our overall system is a decentralized fabric of multiple mutually suspicious platforms, including both public and private chains, and public and private non-chains. Alice running private chain A may or may not be willing to release A's logs to Bob, running public chain B, even if it would help Bob diagnose a problem. Our system must support Bob in both scenarios. When Bob can get all the relevant logs, we wish his debugging experience to approximate as close as possible the pleasure of the local debugging experience. When Bob can only get some logs, his ability to debug should degrade gracefully.

Our comm system sends errors by copy. At the level of abstraction of the distributed computation, an error serialized and sent by Alice is the "same" as the error as received and unserialized by Bob. At the JavaScript level of abstraction, they are of course distinct objects. Alice's system holds all this extra hidden information about the error she's sending, that her console uses to output useful diagnostic information. Alice's comm system therefore cannot simply serialize and send this information to untrusted Bob. Instead, Alice's comm system should generate identifying information which allegedly identifies this error. Alice's comm system should include this identifier in the serialization of the error, and it should arrange to locally log the association of this error with this identifier. Bob's comm system, on unserializing the error, should annotate this new error with this identifying information from the unserialization of this error.

If Bob's computation then causes that error to be logged, its local stack trace will uselessly identify the unserialializer as the code that created the error. But the annotation should inform Bob that he should go ask Alice for the logs containing the identified error. With more tooling to make such arrangements more automatic and immediate, the relevant portions of Alice's log could be made to appear to Bob as-if they are available in his own local diagnostic information.

However, the above description violates one of our constraints: The automatic logging of a sent error to Alice's log is noisy, especially if neither that error nor its remote copy would ever otherwise be logged. Ideally, this would instead be handled by that [other kind of logging system](https://github.com/Agoric/agoric-sdk/issues/1318) that produces symbolic output to be post-processed into useful diagnostic information. However, this particular special case is uniquely urgent and might not wait for us to build that other kind of logging system. As one possible mechanism, the comm system could maintain a bounded in-memory table of sent errors. If Bob's request arrive while the identified error is still in Alice's table, and Alice wishes to reveal this info to Bob, Alice can log it then.

## Hiding and Revealing Asynchronous Diagnostic Information

This section explains our *plans* to build a logging experience on top of this system that supports local and distributed asynchrony. Also tracked at [Support deep stacks for local asynchronous log-based debugging #1862](https://github.com/Agoric/agoric-sdk/issues/1862) and [Support distributed deep stacks for log-based debugging #1864](https://github.com/Agoric/agoric-sdk/issues/1864).

JavaScript itself is not a dustributed language, but it is a highly asynchronous language. Our distributed computational model&mdash;communicating event loops&mdash;pushes much of our code into making heavy use of this asynchrony. For such code, individual synchronous call stacks are often short and uninformative. [Causeway](https://github.com/Agoric/agoric-sdk/issues/1318#issuecomment-662127549) shows that the asynchronous and distributed analog of synchronous stack traces is a directed acyclic graph of prior causal events, each with their local synchronous stack at their moment of causation. To capture this well requires instrumenting the promise system in ways impossible for user code. However, the most important causal paths are
   * the [eventual-send](https://github.com/tc39/proposal-eventual-send) operations by [handled promise](../../../eventual-send/README.md), whether expressed by `E()` or `~.`.
   * the `.then` operation. However, we replace the builtin `Promise.prototype.then` at our peril. Many built in operations implicitly invoke the original binding of `Promise.prototype.then` in ways we cannot override. However, our same eventual-send package already provides a safer alternative `E.when` operation.

Restricting the instrumentation to these two operations gives predictability and preserves platform independence, but at the loss of some useful diagnostic information. This loss may encourage programmers to shift from their current habits to eventual-send and `E.when`, which would be a good thing anyway.

(Note that some IDE debug experiences now include deep stacks over `await` boundaries. However, the engine provides to access to this mechanism from JavaScript. Without it, these stacks are impossible to capture without an invasive code transform.)

Ideally, the diagnostic information produced by such instrumentation should be sent to [other kind of logging system](https://github.com/Agoric/agoric-sdk/issues/1318), for post-processing by other tools. But it is at least possible to encode it in the system described here. The instrumentation would add enough overhead to eventual-send and `E.when` that it should not be the default setting. When the instrumentation is on, each `E()` or `E.when` operation would create a hidden error, to be associated with the turn it causes. When that turn does such an action, the hidden error it similarly creates would be annotated with the hidden error from the action that created this turn. Looking forward, this records a causal tree of events. Looking backward, it creates a linear "deep stack" of events&mdash;a sequence of shallow stacks. All this extra bookkeeping remains silent until an error is logged. Once an error is logged, its deep stack is included in the recursive logging of its annotations.

(However, this pattern of use will accumulate deep annotation trees&mdash;too deep to keep in memory. Instead we would need to bound the number of annotations we remember, which would require a different data structure.)

## Unreal logging

For deterministically replayable computation, we could support the full debugging experience even if the "real" computation never logs anything. Such a no-op logging system would not need any side tables, and so has no problem with side table memory pressure. Such a no-op logging system never examines logged objects, and so does not create a communications channel. Instead, all logging only happens offline, under instrumented deterministic replay, and only for computation containing a mystery to be diagnosed. Under this scenario, even expensive instrumentation may be very affordable. Under this scenario, if Alice gives Bob enough information to deterministically replay the relevant chain A computation, she's effectively given Bob all the logging information he could ever want. Under this scenario, no mechanism is needed to exempt logging output for on-chain determinism rules, since there would be no on-chain logging output.
