# `@endo/lockdown`

We often need to upgrade a JavaScript environment to HardenedJS as a side
effect of importing a module, so that later modules can rely on the hardened
environment.
The `@endo/lockdown` package simply ensures that SES has both initialized
and locked down the environment.

```js
import '@endo/lockdown'
import 'hardened-modules...';
```

The HardenedJS environment is a subset of the Endo environment.
Use [`@endo/init`](../init) for a more comprehensive upgrade.
