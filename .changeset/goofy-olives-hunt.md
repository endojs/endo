---
'@endo/patterns': minor
---

- PatternMatchers now includes a `M.discriminated(keyName, subPatternsRecord)` function to match a CopyRecord against a sub-pattern selected by the value of a specified discriminator key (i.e., for matching values of a discriminated union type). Behaviorally, the new matchers are slightly weaker than those from `M.or(...patterns)`, but more efficient, and they produce more precise error messages upon match failure. Note that the sub-patterns apply to a derived CopyRecord that lacks the discriminator property, so e.g.
  ```js
  M.discriminated('flavor', {
    original: M.and({ flavor: 'original' }, M.any()),
  })
  ```
  does not match anything, while
  ```js
  M.discriminated('flavor', {
    original: M.any(),
  })
  ```
  matches any CopyRecord with a "flavor" property whose value is "original".
