# @endo/exo

## 1.7.0

### Minor Changes

- [#3172](https://github.com/endojs/endo/pull/3172) [`88bc2b9`](https://github.com/endojs/endo/commit/88bc2b915d95326a3e911a9f8bf4571d948c44d8) Thanks [@turadg](https://github.com/turadg)! - Improve TypeScript inference for patterns, exo, and pass-style. These are compile-time type changes only; no runtime behavior changes.
  - **pass-style**: `CopyArray<T>` is now `readonly T[]` so readonly tuples (e.g. `readonly ['ibc']`) satisfy `Passable`. Backward-compatible because `T[]` still extends `readonly T[]`.
  - **patterns**: `M.remotable()` defaults to `any` (matching `M.promise()`), so unparameterized remotables are assignable to concrete remotable typedefs. The parameterized form `M.remotable<typeof SomeInterfaceGuard>()` still yields precise inference.
  - **patterns**: `TFRemotable` returns `any` (not `Payload`) for non-`InterfaceGuard` arguments.
  - **patterns**: `TFOr` handles array-of-patterns and falls back through `TFAnd`; `M.undefined()` maps to `void`.
  - **patterns**: `TFOptionalTuple` emits truly optional elements; `M.promise()` maps to `PromiseLike`.
  - **patterns**: `TFSplitRecord` handles the empty-rest case correctly.
  - **patterns**: `TFRestArgs` unwraps array patterns.
  - **patterns**: `TypeFromArgGuard` discriminates by `toStringTag`, not structural shape.
  - **patterns**: `MatcherOf` payload is preserved through `InterfaceGuard`.
  - **patterns**: new `CastedPattern<T>` for unchecked type assertions in pattern position.
  - **exo**: `defineExoClass`, `defineExoClassKit`, and `makeExo` no longer intersect facet constraints with `& Methods`. The previous constraint collapsed specific facet keys into the `string | number | symbol` index signature, making `FilteredKeys` return `never` and erasing facet method inference (`Pick<X, never> = {}`).
  - **exo**: `Guarded<M, G>` is now structurally compatible across `G`, and the kit `F` constraint is widened.
  - **exo**: `defineExoClassKit` preserves facet inference when no guard is supplied.

  TypeScript consumers that were working around the previous inference gaps with casts may be able to remove those casts. Downstream code that depended on the narrower `CopyArray<T> = T[]` or the previous `M.remotable()` default may need minor adjustments.

- [#3133](https://github.com/endojs/endo/pull/3133) [`9111b4e`](https://github.com/endojs/endo/commit/9111b4e657d07e2f138a9192238849828c2b52aa) Thanks [@turadg](https://github.com/turadg)! - feat: infer TypeScript types from pattern guards
  - `TypeFromPattern<P>` — infer static types from any pattern matcher
  - `TypeFromMethodGuard<G>` — infer function signatures from `M.call()` / `M.callWhen()` guards
  - `TypeFromInterfaceGuard<G>` — infer method records from interface guard definitions
  - `M.remotable<typeof Guard>()` — facet-isolated return types in exo kits
  - `M.infer<typeof pattern>` — namespace shorthand analogous to `z.infer`
  - `matches` and `mustMatch` now narrow the specimen type via type predicates
  - `makeExo`, `defineExoClass`, and `defineExoClassKit` enforce method signatures against guards at compile time

  These are compile-time type changes only; there are no runtime behavioral changes.
  Existing TypeScript consumers may see new type errors where method signatures diverge from their guards.

### Patch Changes

- Updated dependencies [[`8195a5a`](https://github.com/endojs/endo/commit/8195a5aa8dd99d147b34e40ce8fa7328ce596e87), [`98c89b7`](https://github.com/endojs/endo/commit/98c89b79a22c2a038e90ac1d81abdf6127f70e10), [`f65b000`](https://github.com/endojs/endo/commit/f65b0002324d38210d11000cff741c5c8dc83b60), [`88bc2b9`](https://github.com/endojs/endo/commit/88bc2b915d95326a3e911a9f8bf4571d948c44d8), [`9111b4e`](https://github.com/endojs/endo/commit/9111b4e657d07e2f138a9192238849828c2b52aa), [`43165e5`](https://github.com/endojs/endo/commit/43165e584cfd6437c7f8edb8872ff81ed4415ed6), [`df84eea`](https://github.com/endojs/endo/commit/df84eeaa25af0b9c2c5b98c27ac95e4cb39f0001), [`6ada52b`](https://github.com/endojs/endo/commit/6ada52b6e6fdb19508624a1c93bd4a65c60670dd)]:
  - @endo/patterns@1.9.0
  - @endo/common@1.4.0
  - @endo/eventual-send@1.5.0
  - @endo/pass-style@1.8.0
  - @endo/errors@1.3.1
  - @endo/far@1.1.14
  - @endo/harden@1.1.0

## 1.6.0

### Minor Changes

- [#3008](https://github.com/endojs/endo/pull/3008) [`d83b1ab`](https://github.com/endojs/endo/commit/d83b1ab9fabc4f7b9b12fa9574749e46e03f26ea) Thanks [@kriskowal](https://github.com/kriskowal)! - - Relaxes dependence on a global, post-lockdown `harden` function by taking a
  dependency on the new `@endo/harden` package.
  Consequently, bundles will now entrain a `harden` implementation that is
  superfluous if the bundled program is guaranteed to run in a post-lockdown
  HardenedJS environment.
  To compensate, use `bundle-source` with `-C hardened` or the analogous feature
  for packaging conditions with your preferred bundler tool.
  This will hollow out `@endo/harden` and defer exclusively to the global
  `harden`.

### Patch Changes

- Updated dependencies [[`2e00276`](https://github.com/endojs/endo/commit/2e00276ce0f08beb5e5259b8df195063fe008fe7), [`98f77e9`](https://github.com/endojs/endo/commit/98f77e9a77040cafe27f2facb5900f1c57043a20), [`029dcc4`](https://github.com/endojs/endo/commit/029dcc464cd93bc7380da45e694585ab2f7aa139), [`2e00276`](https://github.com/endojs/endo/commit/2e00276ce0f08beb5e5259b8df195063fe008fe7), [`98f77e9`](https://github.com/endojs/endo/commit/98f77e9a77040cafe27f2facb5900f1c57043a20), [`d83b1ab`](https://github.com/endojs/endo/commit/d83b1ab9fabc4f7b9b12fa9574749e46e03f26ea), [`c488503`](https://github.com/endojs/endo/commit/c488503b4f84e499e05e361e21a78fa362f3fc66), [`98f77e9`](https://github.com/endojs/endo/commit/98f77e9a77040cafe27f2facb5900f1c57043a20)]:
  - @endo/errors@1.3.0
  - @endo/patterns@1.8.0
  - @endo/harden@1.1.0
  - @endo/common@1.3.0
  - @endo/eventual-send@1.4.0
  - @endo/pass-style@1.7.0

## [1.5.12](https://github.com/endojs/endo/compare/@endo/exo@1.5.11...@endo/exo@1.5.12) (2025-07-12)

**Note:** Version bump only for package @endo/exo

## [1.5.11](https://github.com/endojs/endo/compare/@endo/exo@1.5.10...@endo/exo@1.5.11) (2025-06-17)

**Note:** Version bump only for package @endo/exo

## [1.5.10](https://github.com/endojs/endo/compare/@endo/exo@1.5.9...@endo/exo@1.5.10) (2025-06-02)

**Note:** Version bump only for package @endo/exo

## [1.5.9](https://github.com/endojs/endo/compare/@endo/exo@1.5.8...@endo/exo@1.5.9) (2025-03-24)

**Note:** Version bump only for package @endo/exo

## [1.5.8](https://github.com/endojs/endo/compare/@endo/exo@1.5.7...@endo/exo@1.5.8) (2025-01-24)

**Note:** Version bump only for package @endo/exo

## [1.5.7](https://github.com/endojs/endo/compare/@endo/exo@1.5.6...@endo/exo@1.5.7) (2024-11-13)

**Note:** Version bump only for package @endo/exo

## [1.5.6](https://github.com/endojs/endo/compare/@endo/exo@1.5.5...@endo/exo@1.5.6) (2024-10-22)

**Note:** Version bump only for package @endo/exo

## [1.5.5](https://github.com/endojs/endo/compare/@endo/exo@1.5.4...@endo/exo@1.5.5) (2024-10-22)

**Note:** Version bump only for package @endo/exo

## [1.5.4](https://github.com/endojs/endo/compare/@endo/exo@1.5.3...@endo/exo@1.5.4) (2024-10-10)

**Note:** Version bump only for package @endo/exo

## [1.5.3](https://github.com/endojs/endo/compare/@endo/exo@1.5.2...@endo/exo@1.5.3) (2024-08-27)

**Note:** Version bump only for package @endo/exo

## [1.5.2](https://github.com/endojs/endo/compare/@endo/exo@1.5.1...@endo/exo@1.5.2) (2024-08-01)

**Note:** Version bump only for package @endo/exo

## [1.5.1](https://github.com/endojs/endo/compare/@endo/exo@1.5.0...@endo/exo@1.5.1) (2024-07-30)

**Note:** Version bump only for package @endo/exo

## [1.5.0](https://github.com/endojs/endo/compare/@endo/exo@1.4.0...@endo/exo@1.5.0) (2024-05-07)

- A call to an exo will only throw a throwable, i.e., a Passable without capabilities, i.e., without Remotables or Promises. It will consist only of copy data and Passable errors. Passable errors themselves cannot contain capabilities, and so are throwable. An async exo `callWhen` method will likewise only reject with a throwable reason. Both contraints help security reviews, since experience shows it is too hard for reviewers to be adequately vigilant about capabilities communicated over the implicit exceptional control flow pathways.

## [1.4.0](https://github.com/endojs/endo/compare/@endo/exo@1.3.0...@endo/exo@1.4.0) (2024-04-04)

### Features

- **types:** Exo param helpers ([b708d48](https://github.com/endojs/endo/commit/b708d48b3b7f5ed7035866760d622021fb65e02c))

### Bug Fixes

- **types:** export all makers and tools ([c5ba502](https://github.com/endojs/endo/commit/c5ba50247ece8c07196e9854294ccd83788c1126))

## [1.3.0](https://github.com/endojs/endo/compare/@endo/exo@1.2.1...@endo/exo@1.3.0) (2024-03-20)

### Features

- **ses-ava:** import test from @endo/ses-ava/prepare-endo.js ([#2133](https://github.com/endojs/endo/issues/2133)) ([9d3a7ce](https://github.com/endojs/endo/commit/9d3a7ce150b6fd6fe7c8c4cc43da411e981731ac))

## [1.2.1](https://github.com/endojs/endo/compare/@endo/exo@1.2.0...@endo/exo@1.2.1) (2024-02-23)

**Note:** Version bump only for package @endo/exo

## [1.2.0](https://github.com/endojs/endo/compare/@endo/exo@1.1.0...@endo/exo@1.2.0) (2024-02-15)

### Features

- **exo:** instance testing ([#1925](https://github.com/endojs/endo/issues/1925)) ([05d46d6](https://github.com/endojs/endo/commit/05d46d6aafa93fad66210e6632c7216e4bea7252))

### Bug Fixes

- Add repository directory to all package descriptors ([e5f36e7](https://github.com/endojs/endo/commit/e5f36e7a321c13ee25e74eb74d2a5f3d7517119c))
- **patterns,exo:** Tolerate old guard format ([#2038](https://github.com/endojs/endo/issues/2038)) ([d5b31d9](https://github.com/endojs/endo/commit/d5b31d9ffcf7950c79070a7e792d466bd36ef5ff))

## [1.1.0](https://github.com/endojs/endo/compare/@endo/exo@1.0.1...@endo/exo@1.1.0) (2024-01-18)

### Features

- **env-options:** env-options conveniences for common cases ([#1710](https://github.com/endojs/endo/issues/1710)) ([4c686f6](https://github.com/endojs/endo/commit/4c686f6c9c3c54dbf73e8e7cd80a4dfebcbc61df))
- **exo:** lightweight inter-facet rights amplification ([b645649](https://github.com/endojs/endo/commit/b645649aefbda2ec31925ff6072b6dd5eb8e8d43))

### Bug Fixes

- "x" parameter in many tests was optional ([#1965](https://github.com/endojs/endo/issues/1965)) ([1ff3c4b](https://github.com/endojs/endo/commit/1ff3c4b45a4f9f6bf723d3200548db37df46989f))
- **common:** fix @endo/common integration breakage ([#1963](https://github.com/endojs/endo/issues/1963)) ([73b5059](https://github.com/endojs/endo/commit/73b50590b7aef7eaffe2c435286fb291bf9b22bf))
- **exo:** ContextProvider typing ([#1966](https://github.com/endojs/endo/issues/1966)) ([99107d4](https://github.com/endojs/endo/commit/99107d41e1f025fcaf13aef27b0b174a55939c3a))
- **exo:** reform exo amplifier API ([#1924](https://github.com/endojs/endo/issues/1924)) ([4c67fe2](https://github.com/endojs/endo/commit/4c67fe2cbcfd2737cb389b3fb0e358f4eed58af0))
- **exo:** remove receiveRevoker ([#1964](https://github.com/endojs/endo/issues/1964)) ([d848754](https://github.com/endojs/endo/commit/d84875412623bd43a12e79c45e8052dfecdf1a03))
- **exo:** review suggestions ([bf29a3a](https://github.com/endojs/endo/commit/bf29a3af9cb669d46d7baf511063f8ee8e3f2c66))

## [1.0.1](https://github.com/endojs/endo/compare/@endo/exo@1.0.0...@endo/exo@1.0.1) (2023-12-20)

**Note:** Version bump only for package @endo/exo

## [1.0.0](https://github.com/endojs/endo/compare/@endo/exo@0.2.6...@endo/exo@1.0.0) (2023-12-12)

### ⚠ BREAKING CHANGES

- **exo:** reject extra args by default
- **exo:** extra undeclared args dropped

### Features

- **defaultGuards:** absorb `sloppy` and `raw` ([58a3d42](https://github.com/endojs/endo/commit/58a3d42a92102336d814690430e0feb3773227d4))
- **defendSyncMethod:** implement raw exo methods ([c8126dc](https://github.com/endojs/endo/commit/c8126dc9d863fbb69cc53d57514368ba931df7fe))
- **exo:** opt out individual arguments ([bf593d8](https://github.com/endojs/endo/commit/bf593d8e83ba7eb231b4d3a909c41751ab24fe66))
- **pass-style:** Far GET_METHOD_NAMES meta method ([b079812](https://github.com/endojs/endo/commit/b07981215a64766b2813f92f6d6c430d181b5512))

### Bug Fixes

- Adjust type generation in release process and CI ([9465be3](https://github.com/endojs/endo/commit/9465be369e53167815ca444f6293a8e9eb48501d))
- **exo:** allow richer behaviorMethods ([fde26da](https://github.com/endojs/endo/commit/fde26da22f03a18045807d833c8e03c4409fd877))
- **exo:** extra undeclared args dropped ([3a7e13c](https://github.com/endojs/endo/commit/3a7e13ce28f37e16c623df9804134d73326c3032))
- **exo:** reject extra args by default ([4d100ef](https://github.com/endojs/endo/commit/4d100ef2527b74ea776b79533e996c87e983537c))
- **exo:** Relax requirement on implementation of **getInterfaceGuard** method ([64e1099](https://github.com/endojs/endo/commit/64e109997c4d1d67c2643c6d5f8c890cdb31df7e))
- **exo:** tighten typing ([c50ee18](https://github.com/endojs/endo/commit/c50ee18b543c8da921cd095cdc65b56df1761b9f))
- **exo:** update `M.callWhen` broken by `M.raw()` ([015696d](https://github.com/endojs/endo/commit/015696dc744599334f678d0c4882727cbeef8b04))
- Import types explicitly throughout ([631d087](https://github.com/endojs/endo/commit/631d087e291262ce3e798f7a15482c534cb7233b))
- **patterns:** remove `defaultGuards: 'never'` for `undefined` ([77d04b2](https://github.com/endojs/endo/commit/77d04b2902ddf539f10688dfb84fe2aa9e841f16))
- review suggestions ([9de852b](https://github.com/endojs/endo/commit/9de852bb78d659ba274e7cacbfda96107844506f))

## [0.2.6](https://github.com/endojs/endo/compare/@endo/exo@0.2.5...@endo/exo@0.2.6) (2023-09-12)

- Adds support for symbol-keyed methods in interface guards, e.g.
  ```
  const LabeledIterableI = M.interface('LabeledIterable', {
    getLabel: M.call().returns(M.string()),
    [Symbol.asyncIterator]: M.call().returns(M.remotable('Iterator')),
  });
  ```

## [0.2.5](https://github.com/endojs/endo/compare/@endo/exo@0.2.3...@endo/exo@0.2.5) (2023-08-07)

**Note:** Version bump only for package @endo/exo

## [0.2.4](https://github.com/endojs/endo/compare/@endo/exo@0.2.3...@endo/exo@0.2.4) (2023-08-07)

**Note:** Version bump only for package @endo/exo

## [0.2.3](https://github.com/endojs/endo/compare/@endo/exo@0.2.2...@endo/exo@0.2.3) (2023-07-19)

### Features

- **env-options:** env-options as separate importable package ([ba266c9](https://github.com/endojs/endo/commit/ba266c95d46a7330aeb73def7a1a0a18242d75cd))
- **exo:** getInterfaceGuard default meta method ([3fd960f](https://github.com/endojs/endo/commit/3fd960f2563ba0cebc8adef2797af6986776d354))
- **types:** parameterize InterfaceGuard ([645a7a8](https://github.com/endojs/endo/commit/645a7a80a45303e6412405b9c4feeb1406592c0c))

### Bug Fixes

- **exo:** do NOT mutate behaviorMethods argument ([43f89ef](https://github.com/endojs/endo/commit/43f89ef0dc5674591907315356b468724aabc33f))

## [0.2.2](https://github.com/endojs/endo/compare/@endo/exo@0.2.1...@endo/exo@0.2.2) (2023-04-20)

- Parse `$DEBUG` as comma-separated

## [0.2.1](https://github.com/endojs/endo/compare/@endo/exo@0.2.0...@endo/exo@0.2.1) (2023-04-14)

- Label remotable instances

## 0.2.0 (2023-03-07)

### ⚠ BREAKING CHANGES

- rename 'fit' to 'mustMatch' (#1464)

### Features

- **exo:** start migrating exo from @agoric/store ([#1459](https://github.com/endojs/endo/issues/1459)) ([a882b7c](https://github.com/endojs/endo/commit/a882b7ca88863d7f85310074c38f3cc0032e1e0e))

### Bug Fixes

- Fix hackerone.com links in SECURITY.md ([#1472](https://github.com/endojs/endo/issues/1472)) ([389733d](https://github.com/endojs/endo/commit/389733dbc7a74992f909c38d27ea7e8e68623959))
- missed documentation suggestion ([#1463](https://github.com/endojs/endo/issues/1463)) ([3f266bf](https://github.com/endojs/endo/commit/3f266bffdf122c73dedada6f311de770210b426a))

### Miscellaneous Chores

- rename 'fit' to 'mustMatch' ([#1464](https://github.com/endojs/endo/issues/1464)) ([a4f88f8](https://github.com/endojs/endo/commit/a4f88f8ef1e7d62b993900244e260d90113f9759))
