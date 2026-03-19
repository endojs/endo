# Add a token estimation utility

Phase 0 prerequisite for genie tiered memory (from
`PLAN/genie_memory_implementation.md`).

## Problem

There is no way to measure how many tokens the message history
consumes.
The observer's 30k-token trigger threshold requires a token
estimator, and Phase 3's context budget management will need one
as well.

## Tasks

- [x] Create `src/utils/tokens.js` (or similar) with an
  `estimateTokens(text)` function
- [x] Start with a simple heuristic: `Math.ceil(text.length / 4)`
- [x] Export and harden the function per project conventions
- [x] Add basic tests for the estimator

## Notes

- The chars÷4 heuristic is intentionally rough for Phase 0.
  A more accurate tokenizer (e.g., tiktoken bindings) can replace
  it later without changing the interface.
- The function should accept a string and return a number.

## References

- `PLAN/genie_memory_implementation.md` § Phase 0
- Observer trigger threshold discussion in § Phase 1
