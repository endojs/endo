---
'@endo/eslint-plugin': major
---

**Breaking:** Backwards compatibility with legacy ESLint config files is provided on a best-effort basis, given ESLint's deprecation of rules and third-party replacements. Recommended rules from ESLint 9+ have also been configured. 

**Breaking:** Minimum supported Node.js version is now v22.12.0.

**Breaking:** `@jessie.js/eslint-plugin` is no longer a dependency of `@endo/eslint-plugin`. This removes a cyclic dependency (`@jessie.js/eslint-plugin` depends on `@endo/eslint-plugin`, and vice versa).

- `eslint-plugin-unicorn` is no longer a peer dependency of `@endo/eslint-plugin` and can be safely removed from your `devDependencies` (unless you consume it directly, of course).

- The `flat/recommended` config no longer registers the `@jessie.js` plugin, applies `@jessie.js/safe-await-separator`, or installs the `use-jessie` processor. The legacy `recommended` and `internal` configs likewise no longer extend `plugin:@jessie.js/recommended` or set the `@jessie.js/use-jessie` processor. See "Migration" below for more details.

- New rules have been added from `@eslint/js`' `recommended` configuration, including `no-assign-to-exported-let-var-or-function` and `no-harden-pattern-maker`, which may or may not already be handled by your existing configuration.

**Migration:** Consumers that rely on the rules and processor provided by `@jessie.js/eslint-plugin` must install `@jessie.js/eslint-plugin` manually and wire it up alongside `@endo/eslint-plugin`:

```js
import jessie from '@jessie.js/eslint-plugin';
import endo from '@endo/eslint-plugin';

export default [
  ...endo.configs['flat/recommended'],
  ...jessie.configs['flat/recommended'],
  { processor: jessie.processors['use-jessie'] },
];
```

Furthermore, the new rules will need to be addressed as appropriate for your project.

