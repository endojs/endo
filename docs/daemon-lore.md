---
title: daemon-lore
group: Documents
category: Lore
---

# Endo Daemon Lore

This document will evolve to record jargon, terms, and explain concepts used
by, in, and around the `@endo/daemon`.

## Lore?

This document is called "lore" because the author (jcorbin) deos not yet know
how to group or otherwise organize it, and so hesitates to call this a "Guide"
or "Reference" documentation.

In fact this document will mostly grow by:
1. pasting in notes and snippets of chat conversation
2. telling an LLM-empowered-agent to rework it
3. then later reviewing or refining its progress

# Concepts

## caplet

A program that exports `make(powers)`, and returns a capability, and is
intended to live as long as that capability shall live.

## runlet

A program that exports `main(powers)`, and is not expected to return anything,
and consequently, is not intended to exceed the life of the main. Whether to
wait for IO handles to close is debatable still.

Neither caplet nor runlet is a Worker.

## worklet

A caplet that is intended to run in a Worker.

**Note:** Workers can be co-tenant but YMMV what with availability and
HardenedJS not being quite bullet-proof for passable proxies.

## weblet

A caplet that runs in a `WebView`.

Web views are not safely co-tenant.
They rely on same origin isolation.

They persist only so long as the window is open.

## Gateway

Hosts:
- Weblets of HTTP
- CapTP over WS
- `localhttp://` in familiar mode

**Weblet 2 modes:**
- Gateway provides demi-secure port hosting
- Familiar is more secure via `localhttp://`

## Formula

A JSON spec for an object constructor:
- a readable blob is one of the most primitive types
- notably program source code gets stored in a blob
- evaluating a JS string in the presence of various dependencies

# System Internals

## Graceful Teardown

Design tensions with timely revocation. Need to ensure that:
- Some stuff cleans up
- Don't leave a hole open for something to go rogue

**Considerations:**
- Some workers might not get an opportunity to cleanup
- Workers should be immediately isolated with the closure of open sessions
- This puts them in a "weird hell" where the only thing they can do is teardown,
  and everything they touch remotely throws an async error

# CLI and User Experience

# Notes Circa Endo Sync 2026-03-11

Josh
> also I'm 80% confident that I'll be taking some hedge trimmers to the entire
> cli's commander saga:
> - break things up into topic sections: stop making me read about message,
>   values, and pets, when I'm just trying to scan for "How Does Daemon
>   Operate" commands
> - add all the parts you didn't like:
>   - `endo ps` -- list running wokers? anyone? beuller?
>   - `endo status` -- your ping is cute, but like you have ephemeral state to
>     be reading and reporting back for me
>   - `endo config` -- this is a big one imo, we really want a
>     `~/.config/endo/make_the_env_madness_stop.json` imo
>   - hell I'm even dreaming of `endo enter` -- so you know how `docker enter`
>     will put you in a bash repl for a container name space? give. js. repl.
>     now. wen. debug port in any year, at least opt-in-able when in dev mode
>     o... Read more
>
> I bet that debug port thing needs your exo stream work in the full course of
> time, and is quite a large elephant... but a folk can dream 😉

Kris
> Might be a thing now. We were held back for a long time because Node.js REPL
> entrains "domains", which are like oil and water when it comes to running
> under lockdown.
>
> Yeah, don't worry about streams. We have a stopgap in place that works, just
> not ideal.

Kris
> Adding subcommand sections to the CLI help would be welcome as long as they
> don't deepen the ergonomics unnecessarily. Like "endo ls" not "endo inventory
> ls" plz.

Kris
> Yeah, I haven't even really settled on a conceptual framework for graceful
> teardown because there are design tensions with timely revocation. We just
> need to ensure that some stuff cleans up, but also don't want to leave a hole
> open for something to go rogue. It might be that some workers don't get an
> opportunity to cleanup. They should at least be immediately isolated with the
> closure of open sessions. That puts them in a weird hell where the only thing
> they can do is teardown, and everything they touch remotely throws an async
> error.
>
> If we do add a REPL, it does mean we have CLI, REPL, *and* Chat to keep in
> sync when the command vocabulary evolves. I don't think we can get down to
> just 1, but staying at 2 until the vocabulary settles has been prudent so
> far.
>
> If we go up to 3, it would behoove us to have a framework in place so we only
> need to maintain one set of commands for both REPL and CLI. And also, find
> the right strike between build and buy on that front. I've — so far — managed
> to have the restraint not to go down the "make a new command line flag
> parser" bunny hole.

Kris
> The vernacular is still squishy. So, don’t think of this explanation as a
> defense of the names, just an inventory of the concepts that (maybe) don’t
> even need names.
>
> - A caplet is a program that exports make(powers), and returns a capability,
>   and is intended to live as long as that capability shall live.
> - A runlet is a program that exports main(powers), and is not expected to
>   return anything, and consequently, is not intended to exceed the life of
>   the main. Whether to wait for IO handles to close is debatable still.
>
> Neither caplet nor runlet is a Worker.

Kris
> Pressing enter on this a bit late:
>
> - A worklet is a caplet that runs in a Worker. Workers can be co-tenant but
>   YMMV what with availability and HardenedJS not being quite bullet-proof for
>   passable proxies.
> - A weblet is a caplet that runs in a WebView. Web views are not safely
>   co-tenant. They rely on same origin isolation. They persist only so long as
>   the window is open.

- [ ] TODO find and research these:
  - [ ] Mark Miller chapter 14/16 invariants
  - [ ] Mark's paper on distributed confinement
