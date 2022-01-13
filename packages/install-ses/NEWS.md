## Next Release

The `@agoric/import-ses` package exists so the "main" of production code can
start with the following import or its equivalent.
```js
import '@agoric/install-ses';
```
But production code must also be tested. Normal ocap discipline of passing
explicit arguments into the `lockdown`
call would require an awkward structuring of start modules, since
the `install-ses` module calls `lockdown` during its initialization,
before any explicit code in the start module gets to run. Even if other code
does get to run first, the `lockdown` call in this module happens during
module initialization, before it can legitimately receive parameters by
explicit parameter passing.

Instead, for now, `install-ses` violates normal ocap discipline by feature
testing global state for a passed "parameter". This is something that a
module can but normally should not do, during initialization or otherwise.
Initialization is often awkward.

The `install-ses` module tests, first,
for a JavaScript global named `LOCKDOWN_OPTIONS`, and second, for an environment
variable named `LOCKDOWN_OPTIONS`. If either is present, its value should be
a JSON encoding of the options bag to pass to the `lockdown` call. If so,
then `install-ses` calls `lockdown` with those options. If there is no such
feature, `install-ses` calls `lockdown` with appropriate settings for
production use.
