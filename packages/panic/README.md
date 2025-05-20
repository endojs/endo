# `@endo/panic`

This `@endo/panic` package is an imperfect ponyfill of the `panic` function from the
[Don't Remember Panicking](https://github.com/tc39/proposal-oom-fails-fast) tc39 proposal. The proposed `panic` function would immediately terminate at least the so-called "agent", i.e., the JavaScript thread/vat/event-loop, making its internal data state (stack and heap) immediately unobservable.
```js
import { panic } from `@endo/panic`

// As a stronger assertion
if (mustAlwaysBeFalse()) {
  panic(Error('Was true, which must never happen'));
}

// Prepare-commit "all or none" transactional pattern
function transaction() {
  // prepare phase with no side effects, which might exit early with `return`
  // of `throw`. Such an early exit is the "none" of "all or none" side effects.
  prepare();
  try {
    // commit phase, where exit by `throw` must not happen, so all side effects
    // expressed by normal *local* control-flow happen. This is normally
    // straight-line code with no control-flow, making the set of side effects
    // that must all happen clear. This implements the "all" of "all or none"
    // side effects.
    localSideEffect1();
    localSideEffect2();
  } catch (err) {
    // Neither "all" or "none" happened, leaving behind unrecoverable corrupt
    // local data, which therefore must not be observable to user code.
    panic(Error(`unrecoverable transaction fail due to ${err}`));
  }
}
```

If in an environment also able to import from `@endo/errors`, that last line could instead be
```js
    import { makeError, X, q } from `@endo/errors`
    // Better diagnostic on the ses `console`
    panic(makeError(X`unrecoverable transaction fail due to ${q(err)}`));
```

## Details

By "ponyfill" vs "shim", we mean that a ponyfill does not modify the primordial intrinsics/built-ins, but rather just exports its new functionality as conventional package/module exports. By contrast, a "shim" does modify the primordial intrinsics/built-ins as needed to most closely emulate the proposal it shims.

Our normal style for a package that emulates a proposal is to default-export the ponyfill, and then when ready, separately export the shim built on that ponyfill. In the case of `panic`, once the proposal gets farther along in the tc39 stage process, we will likely add a `panic-shim` export to this package. But it is too early to do that now. A downside is that a ponyfill by itself is subject to the [Eval Twin Problem](https://github.com/endojs/endo/issues/1583), whereas a shim is not.

The reason this `panic` ponyfill is an _imperfect_ emulation of the proposed `panic` is that, currently, JavaScript has no reliable or portable way to exit execution immediately with no further execution of user-code in the same agent. This is indeed why we propose adding `panic` to the language, because it would be a fundamental new ability.

This approximate emulation first logs a diagnostic on the `console`, if there is one. It then proceeds in three layers
- first, following the precedent of `@endo/pass-style` for the `passStyleOf` export, this package also exports a registered symbol, here `PanicEndowmentSymbol`. Each call to `panic` first looks for `globalThis[PanicEndowmentSymbol]`. If it exists and is a function, then `panic` delegates to that function. As with `passStyleOf`, when this works, it also deals with the eval-twin problem. We expect `@agoric/swingset-liveslots` to endow such a global binding to the compartments it creates. See [agoric-sdk Draft PR #11173 Don't remember panicking](https://github.com/Agoric/agoric-sdk/pull/11173)
- next, `panic` checks if there is a known platform-specific immediate-exit operation and uses that. Initially, that is only Node's `globalThis.process.abort`. As we become aware of similar functionality on other platforms, we expect to add them here.
- as a last resort, `panic` throws an error, which therefore violates the fundamental purpose of `panic`, which is to reliably not resume execution of user code. JavaScript has no notion of an uncatchable error, and nothing in Endo is in a position to prevent user code from continuing execution after this error is caught.

    (As noted in the proposal, a higher fidelity emulation could, as a last resort, go into an infinite loop. But the consequences of this are too painful for both manual and CI testing. Besides, on some engines (browsers), in violation of the current JS spec, resume execution of user-code within the agent after the "infinite" loop exceeds a timeout. So even this strategy would not be safe on such engines.)

Because this `panic` ponyfill will, as a last resort, throw an error, users of this ponyfill on a platform where the first two strategies might fail, should cope with this possibility of the resumption of user-mode execution as best they can.

If `panic` can immediately exit, then, if in an environment that distinguishes normal exit vs erroneous exit, `panic` always causes an erroneous exit. By contrast, we do not propose for there to be any similarly ambient form for normal non-erroneous exit, because that should be a privilege to be granted explicit by an object-capability. Historical note: Before this proposal, we had been treating the ability to erroneously exit as an explicit privilege as well. But we are not in a position to prevent user code from going into an infinite loop, which is at least as bad as an erronous exit. Thus, there is no further loss in security by providing an ambient `panic` operation.
