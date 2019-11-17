# Divergences from Standard Module Behavior

This make-importer repository together with the evaluator emulates the EcmaScript standard module behavior by translation to evaluable scripts. In order to meet a set of other goals, we diverge from standard module behavior in the following observable ways.

To understand whether a divergence from standard semantics would break old programs, we would normally examine whether the old program would behave identically. For secure programming, divergences must be examined more closely. A defensive program whose defensiveness relies only on standard semantics, unaware that it runs on an emulation, must still successfully defend against an adversary seeking to exploit the divergence.

## Imported variable have no temporal dead zone

If module A imports variable V from module B, and A reads V before B initializes it, then the read happens during V's temporal dead zone. This can only happen within an import cycle.

   * The standard behavior is that this read should throw a `ReferenceError`.
   * The emulated behavior is that this instead reads an `undefined`.

A only has read access to V, so there is no issue of A assigning to V. Aside from import cycles, this divergence should not be observable. Since the divergence turns an error condition into a non-error, it is unlikely to break the functionality of any programs other than test cases. Since the non-error provides no more power than the expected error, it is unlikely to introduce any exploitable vulnerabilities.

The constraints and goals that together cause this divergence:

   * An exporting module can export a live binding, i.e., a non-const binding that it subsequently assigns.
   * The source code of an importing module does not distinguish an imported live binding from an imported stable binding.
   * We translate each module separately, without any inter-module analysis. Thus, our translation must assume that any imported variable might be a live binding.
   * The translation translates only import declarations, export declarations, and eventually dynamic import expressions and `import.meta` expressions. All other source text must remain exactly as it originally appeared.
   * In particular, assignments to exported variables must not be rewritten. To accomplish this, we intercept these assignments in the scopeHandler proxy trap, which is expensive.
   * The typical case, by far, is a stable binding. Stable bindings must be efficient, by translation to a lexical variable binding.
   * When the exported binding is stable, the imported binding must also be efficient, and therefore also translated to a lexical variable binding.

## Exported functions are not bound early

According to the standard, exported functions are bound immediately, without any temporal dead zone. Again, this special case is only observable within an import cycle. With enough work we could probably emulate this special case. However, currently, we treat the binding of function declarations the same way we treat other bindings.

An imported variable bound to an exported function, read during an import cycle, may produce an `undefined` when it should have produced the function itself. This reduces access compared to standard behavior, and so has some risk of breaking the fuctionality of old programs, though still tiny. Since it is only a reduction of access, it is unlikely to introduce any exploitable vulnerabilities.

## Top level await is not yet implemented

We have not yet encountered the need for this in our own code. Emulating top level await correctly will be a lot of work, which we are postponing until we find a need. Since this divergence results in an unexpected SyntaxError, it cannot break the functionality of any syntactically accepted program, and it cannot introduce a vulnerability.

Some other translation-based implementations (TODO which ones?) of top-level await translates the module as a whole into an async function, and translates top-level await into an `await` at the top level of that function body. Our translation already turns a module into a function, so we could implement this shortcut easily. Studying the experiences with these other systems may help us evaluate how well this shortcut preserves functionality in practice. It seems implausible that this shortcut would introduce vulnerabilities, but it is difficult to reason about with confidence.
