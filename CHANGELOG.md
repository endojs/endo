# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [1.3.1](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.3.0...@agoric/bundle-source@1.3.1) (2021-04-07)

**Note:** Version bump only for package @agoric/bundle-source





# [1.3.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.2.4...@agoric/bundle-source@1.3.0) (2021-04-06)


### Features

* **bundle-source:** Apply evasive transforms to Endo archives ([#2768](https://github.com/Agoric/agoric-sdk/issues/2768)) ([e15cee8](https://github.com/Agoric/agoric-sdk/commit/e15cee88cf1f74e2debd4426dbc22a99b88fb1d6))
* **bundle-source:** Specific ModuleFormat type ([#2767](https://github.com/Agoric/agoric-sdk/issues/2767)) ([6fe2ff7](https://github.com/Agoric/agoric-sdk/commit/6fe2ff7d535ef5749f4e9bf7056b5e7dab897a61))





## [1.2.4](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.2.3...@agoric/bundle-source@1.2.4) (2021-03-24)

**Note:** Version bump only for package @agoric/bundle-source





## [1.2.3](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.2.2...@agoric/bundle-source@1.2.3) (2021-03-16)


### Bug Fixes

* make separate 'test:xs' target, remove XS from 'test' target ([b9c1a69](https://github.com/Agoric/agoric-sdk/commit/b9c1a6987093fc8e09e8aba7acd2a1618413bac8)), closes [#2647](https://github.com/Agoric/agoric-sdk/issues/2647)
* upgrade ses to 0.12.3 to avoid console noise ([#2552](https://github.com/Agoric/agoric-sdk/issues/2552)) ([f59f5f5](https://github.com/Agoric/agoric-sdk/commit/f59f5f58d1567bb11710166b1dbc80f25c39a04f))





## [1.2.2](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.2.1...@agoric/bundle-source@1.2.2) (2021-02-22)


### Bug Fixes

* **bundle-source:** Downgrade @rollup/plugin-commonjs for Windows ([2721da7](https://github.com/Agoric/agoric-sdk/commit/2721da770aad3077f1024b71c217883f31461641))





## [1.2.1](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.2.0...@agoric/bundle-source@1.2.1) (2021-02-16)


### Bug Fixes

* explicit setting in test-sanity ([#2388](https://github.com/Agoric/agoric-sdk/issues/2388)) ([6be4e02](https://github.com/Agoric/agoric-sdk/commit/6be4e0212d19a542ead6cd4bcef4cb6688a9d7d3))
* take advantage of `/.../` being stripped from stack traces ([7acacc0](https://github.com/Agoric/agoric-sdk/commit/7acacc0d6ac06c37065ce984cc9147c945c572e5))





# [1.2.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.1.10...@agoric/bundle-source@1.2.0) (2020-12-10)


### Features

* **import-bundle:** Preliminary support Endo zip hex bundle format ([#1983](https://github.com/Agoric/agoric-sdk/issues/1983)) ([983681b](https://github.com/Agoric/agoric-sdk/commit/983681bfc4bf512b6bd90806ed9220cd4fefc13c))





## [1.1.10](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.1.10-dev.0...@agoric/bundle-source@1.1.10) (2020-11-07)

**Note:** Version bump only for package @agoric/bundle-source





## [1.1.10-dev.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.1.9...@agoric/bundle-source@1.1.10-dev.0) (2020-10-19)

**Note:** Version bump only for package @agoric/bundle-source





## [1.1.9](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.1.9-dev.2...@agoric/bundle-source@1.1.9) (2020-10-11)

**Note:** Version bump only for package @agoric/bundle-source





## [1.1.9-dev.2](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.1.9-dev.1...@agoric/bundle-source@1.1.9-dev.2) (2020-09-18)

**Note:** Version bump only for package @agoric/bundle-source





## [1.1.9-dev.1](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.1.9-dev.0...@agoric/bundle-source@1.1.9-dev.1) (2020-09-18)

**Note:** Version bump only for package @agoric/bundle-source





## [1.1.9-dev.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.1.8...@agoric/bundle-source@1.1.9-dev.0) (2020-09-18)

**Note:** Version bump only for package @agoric/bundle-source





## [1.1.8](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.1.7...@agoric/bundle-source@1.1.8) (2020-09-16)

**Note:** Version bump only for package @agoric/bundle-source





## [1.1.7](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.1.6...@agoric/bundle-source@1.1.7) (2020-08-31)


### Bug Fixes

* **bundle-source:** fix comment misparse, make require optional ([e8f4127](https://github.com/Agoric/agoric-sdk/commit/e8f412767c5ad8a0e75aa29357a052fd2164e811)), closes [#1281](https://github.com/Agoric/agoric-sdk/issues/1281) [#362](https://github.com/Agoric/agoric-sdk/issues/362)
* get line numbers to be proper again ([8c31701](https://github.com/Agoric/agoric-sdk/commit/8c31701a6b4353e549b7e8891114a41ee48457c8))
* use Babel to strip comments and unmap line numbers ([24edbbc](https://github.com/Agoric/agoric-sdk/commit/24edbbc985500233ea876817228bbccc71b2bac3))
* use only loc.start to ensure nodes begin on the correct line ([dc3bc65](https://github.com/Agoric/agoric-sdk/commit/dc3bc658cc2900a1f074c8d23fd3e5bae9773e18))





## [1.1.6](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.1.5...@agoric/bundle-source@1.1.6) (2020-06-30)


### Bug Fixes

* **bundle-source:** tests use install-ses ([f793424](https://github.com/Agoric/agoric-sdk/commit/f793424ea4314f5cf0fe61c6e49590b2d78e13c6))
* handle circular module references in nestedEvaluate ([9790320](https://github.com/Agoric/agoric-sdk/commit/97903204fa1bd2fd4fec339d7e27e234148ca126))





## [1.1.5](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.1.4...@agoric/bundle-source@1.1.5) (2020-05-17)


### Bug Fixes

* make output from bundleSource correspond to source map lines ([c1ddd4a](https://github.com/Agoric/agoric-sdk/commit/c1ddd4a0a27de9561b3bd827213562d9741e61a8))
* remove many build steps ([6c7d3bb](https://github.com/Agoric/agoric-sdk/commit/6c7d3bb0c70277c22f8eda40525d7240141a5434))





## [1.1.4](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.1.3...@agoric/bundle-source@1.1.4) (2020-05-10)

**Note:** Version bump only for package @agoric/bundle-source





## [1.1.3](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.1.2...@agoric/bundle-source@1.1.3) (2020-05-04)


### Bug Fixes

* default to nestedEvaluate format for better debugging ([4502f39](https://github.com/Agoric/agoric-sdk/commit/4502f39a46096b6f02a3a251989060b3bce4c3b2))
* use the new (typed) harden package ([2eb1af0](https://github.com/Agoric/agoric-sdk/commit/2eb1af08fe3967629a3ce165752fd501a5c85a96))





## [1.1.2](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.1.2-alpha.0...@agoric/bundle-source@1.1.2) (2020-04-13)

**Note:** Version bump only for package @agoric/bundle-source





## [1.1.2-alpha.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.1.1...@agoric/bundle-source@1.1.2-alpha.0) (2020-04-12)


### Bug Fixes

* rewrite HTML comments and import expressions for SES's sake ([1a970f6](https://github.com/Agoric/agoric-sdk/commit/1a970f65b67e047711e53949a286f1587b9a2e75))





## [1.1.1](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.1.1-alpha.0...@agoric/bundle-source@1.1.1) (2020-04-02)

**Note:** Version bump only for package @agoric/bundle-source





## [1.1.1-alpha.0](https://github.com/Agoric/agoric-sdk/compare/@agoric/bundle-source@1.1.0...@agoric/bundle-source@1.1.1-alpha.0) (2020-04-02)

**Note:** Version bump only for package @agoric/bundle-source





# 1.1.0 (2020-03-26)


### Bug Fixes

* make code clearer ([efc6b4a](https://github.com/Agoric/bundle-source/commit/efc6b4a369cc23813788f5626c61ec412e4e3f6a))
* remove 'Nat' from the set that SwingSet provides to kernel/vat code ([b4798d9](https://github.com/Agoric/bundle-source/commit/b4798d9e323c4cc16beca8c7f2547bce59334ae4))
* silence the builtin modules warning in agoric-cli deploy ([9043516](https://github.com/Agoric/bundle-source/commit/904351655f8acedd5720e5f0cc3ace83b5cf6192))
* **agoric-cli:** changes to make `agoric --sdk` basically work again ([#459](https://github.com/Agoric/bundle-source/issues/459)) ([1dc046a](https://github.com/Agoric/bundle-source/commit/1dc046a02d5e616d33f48954e307692b43008442))
* **bundle-source:** regain default 'getExport' ([f234d49](https://github.com/Agoric/bundle-source/commit/f234d49be14d50d13249d79f7302aa8e594e23d2))
* **bundle-source:** remove `"type": "module"` from package.json ([326b00a](https://github.com/Agoric/bundle-source/commit/326b00af1f01383df0b3cdf3dbb9f1c6d2273002)), closes [#219](https://github.com/Agoric/bundle-source/issues/219)


### Features

* **bundle-source:** make getExport evaluate separate modules ([bec9c66](https://github.com/Agoric/bundle-source/commit/bec9c661f9bf08ae676ba3ae3707c0e23599a58d))
