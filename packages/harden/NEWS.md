User-visible changes in harden:

## Next release

* No changes yet.

## Release 0.0.8 (18-Apr-2020)

* User may explicitly disable the security warning that `harden` does
  not protect against prototype poisoning unless the realm has been
  locked down with SES.
  Set `globalThis.harden` to a `null` value to explicitly disable
  the warning.

## Release 0.0.7 (14-Apr-2020)

* Broadens module system support.

## Release 0.0.5-6 (09-Apr-2020)

* Publishes TypeScript definitions.

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
