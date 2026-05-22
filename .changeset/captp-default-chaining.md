---
'@endo/captp': patch
---

Sweep `makeFinalizingMap`'s `get` operator to use optional chaining
(`keyToRef.get(key)?.deref()`) now that #1514 has completed, replacing
the prior explicit conditional. Behavior is unchanged.
