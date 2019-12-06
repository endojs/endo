User-visible changes in harden:

## Release 0.0.4 (08-Mar-2019)

* Allow harden() to be called on async functions, generator functions, async
  generator functions, generator instances, async generator instances, and
  other exotic objects. Previously these would provoke an exception because
  the necessary prototypes were not in the "fringe" of presumed-hardened
  objects. #22


## Release 0.0.3 (07-Mar-2019)

* Add bundler integration tests. #20


## Release 0.0.2 (20-Feb-2019)

* Update to MakeHardener-0.0.4: this fixes a bug that would allow harden() to
  report success even if some of the prototype chain was not frozen
* API/export change: export a single default `harden` function, rather than
  an object with a `.harden` property. #8
