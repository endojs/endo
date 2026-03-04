# Lal Agent Development Guide

## Architecture

Lal is an AI agent manager that runs as an unconfined guest caplet. It sends a configuration form to HOST on startup, and each form submission spawns a sub-guest worker loop with its own LLM provider connection.

### Setup script (`setup.js`)

- Run via `endo run --UNCONFINED setup.js --powers AGENT` or auto-provisioned via `ENDO_EXTRA`.
- Uses `introducedNames: harden({ AGENT: 'host-agent' })` to give the guest a reference to the host agent (as a lowercase pet name, not the uppercase builtin).
- Guards `provideGuest` with `E(agent).has(name)` to avoid crashes on restart (the handle formula lacks `write` on reincarnation).

### Agent entry point (`agent.js`)

- Exports `make(guestPowers, _context)` — the standard unconfined guest entry point.
- The manager loop: sends form, resolves `host-agent`, pre-scans messages for the latest `formMessageId`, then follows messages for value replies.
- Sub-guests are created via `E(agent).provideGuest(name, { agentName })` which returns the full EndoGuest (not a handle).
- Form submission values are resolved via `E(powers).lookupById(msg.valueId)` (not `adopt()`, which only works for package messages).

## Common Pitfalls

- `Object.create(null)` produces a null-prototype object that SES serializes as a Remotable, not a copyRecord. Use `{}` for plain data objects.
- Guest special names (`AGENT`, `SELF`, `HOST`, etc.) are uppercase and cannot be used as pet names or child names in `introducedNames`.
- `E(powers).lookup(name)` searches the guest's own namespace. To find a pet name written in the host's namespace, use `E(agent).lookup(name)` where `agent` is the host agent reference.
