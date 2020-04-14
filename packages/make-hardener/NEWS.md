User-visible changes in make-hardener:

## Release 0.0.9 (14-Apr-2020)

* Fixes ESM support by publishing sources.

## Release 0.0.8 (16-Mar-2020)

* Hybrid module system support: CommonJS, ESM, emulated ESM with `node -r esm`,
  Rollup, UMD for script tags, and unpkg.com.

## Release 0.0.7 (13-Mar-2020)

* The `harden` function no longer has a `prototype`.
  This is necessary for compatibility with SES 0.7.

## Release 0.0.6 (20-Apr-2019)

* Tolerate objects with unstringifyable prototypes, like `async function`.
  These were handled correctly by the freezing process, but then caused some
  debugging code to throw an exception, which was discovered when we added
  unit tests to cover async functions and generators.
* Add options bundle to `makeHardener(initialFringe, opts={})`. The options
  bundle can contain two keys:
  * `fringeSet`. If present, this should be a `WeakSet`, and it will be used
    to track which objects have been frozen already. Normally
    `makeHardener()` creates a new internal `WeakSet` for this purpose, but
    by providing one as an option, you can keep track of what has been added
    to the set over time. This is most useful for keeping multiple hardener
    instances in sync, specifically for an `immunize` function as explored
    in https://github.com/Agoric/Jessie/issues/27 .
  * `naivePrepareObject`. If present, this function will be invoked with each
    object just before it is frozen.
  Both options should be considered experimental. #35


## Release 0.0.5 (07-Mar-2019)

* Clean up published dist files: `.esm.js` for ES6 Module import, `.cjs.js`
  for CommonJS (NodeJS) `require`, and `.umd.js` for browser `<script>` tags.
  All are built with `rollup` at build/publish time. #17
* Rename the repository to use kebab-case (`make-hardener`) instead of
  CamelCase (`MakeHardener`). #18


## Release 0.0.4 (20-Feb-2019)

* Publish both es6-module and CommonJS versions, use package.json keys to
  distinguish. #10
* Tolerate `harden()` of objects with null prototypes. #11


## Release 0.0.3 (19-Feb-2019)

* Change API to take an iterable (`makeHardener([a,b])`) instead of a splat
  (`makeHardener(a,b)`). #3
* Use the name "fringe" to talk about the edge of the frozen graph.
* Don't commit to the new fringe until prototype checks have passed. #4
* Export a single default function, rather than a composite object named
  `makeHardener`. Imports must be changed to match. #8


## Release 0.0.2 (14-Feb-2019)

Initial release
