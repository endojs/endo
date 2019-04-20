User-visible changes in make-hardener:

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
