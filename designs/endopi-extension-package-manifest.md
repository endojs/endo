# EndoPi: Extension Package Manifest

| | |
|---|---|
| **Created** | 2026-05-15 |
| **Updated** | 2026-05-15 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Proposed |
| **Parent** | [endopi](endopi.md) |

## Motivation

Pi's package model bundles four resource kinds (extensions, skills,
prompt templates, themes) under one `pi` keyword in `package.json`. A
single `pi install npm:@foo/bar` resolves them all. Authors do not
manage four parallel distribution channels; consumers do not run four
install commands.

Endo's `endo install` is single-purpose: it installs one guest plugin.
Skills, prompt templates, and themes (once
[endopi-skills-markdown-format](endopi-skills-markdown-format.md) and
[endopi-prompt-templates](endopi-prompt-templates.md) land) have no
distribution channel. The gap is not the daemon-side substrate (which
is already strong) but the *packaging convention* that lets one author
ship a coordinated set of resources.

## Design

### Manifest

```json
{
  "name": "my-endo-package",
  "keywords": ["endo-package", "endo-skill"],
  "endo": {
    "guests": ["./guests"],
    "skills": ["./skills"],
    "prompts": ["./prompts"],
    "providers": ["./providers"]
  }
}
```

The `endo` key in `package.json` declares which resource directories the
package ships. Auto-discovery fills in defaults if the key is absent
(directories named `guests/`, `skills/`, `prompts/`, `providers/`).

`themes` and other resource kinds are added as new types emerge; the
manifest is extensible without breaking older readers.

### Install

```sh
endo install npm:@foo/bar
endo install npm:@foo/bar@1.2.3
endo install git:github.com/user/repo
endo install git:github.com/user/repo@v1
endo install --project npm:@foo/bar     # project-local
```

The installer resolves the source (npm, git, local path), reads the
manifest, and:

1. Drops `guests/` contents into the daemon's guest-plugin store. (The
   existing `endo install` path.)
2. Drops `skills/` contents into the user's `~/.agents/skills/` (or
   project-local `.agents/skills/`). (The
   [endopi-skills-markdown-format](endopi-skills-markdown-format.md)
   discovery walker picks them up.)
3. Drops `prompts/` contents alongside (per
   [endopi-prompt-templates](endopi-prompt-templates.md)).
4. Registers `providers/` contents with the LLM provider registry (per
   [endopi-provider-registry-and-oauth](endopi-provider-registry-and-oauth.md)).

### Security posture

This is the sharpest contrast with Pi. Pi packages run with full system
authority on first run; Pi's response is "review the source before
installing".

Endo's response: each resource kind has its own confinement.

- **Guests** run under SES with only the capabilities the user grants
  at provisioning time. Package authors do not get to ask for new
  capabilities silently.
- **Skills** are markdown files. Their power is to *instruct* the
  agent, not to *do* anything directly; the agent's own capabilities
  bound what skill instructions can effect.
- **Prompts** are pure text expansion. No capability surface at all.
- **Providers** ship code that talks to an LLM endpoint. The provider
  module runs confined; its network access is gated by the daemon's
  outbound HTTP capability per
  [endoclaw-network-fetch](endoclaw-network-fetch.md).

A package install is therefore *safer than `endo install` is today*
because the new resource kinds (skill, prompt) carry no execution
authority, and the existing one (guest) is unchanged.

### Listing and removal

```sh
endo list packages
endo remove npm:@foo/bar
```

Plus `endo config` to enable/disable installed packages without
uninstalling, mirroring Pi's `pi config`.

## Dependencies

| Design | Relationship |
|--------|--------------|
| [endopi-skills-markdown-format](endopi-skills-markdown-format.md) | Consumer of `skills/` |
| [endopi-prompt-templates](endopi-prompt-templates.md) | Consumer of `prompts/` |
| [endopi-provider-registry-and-oauth](endopi-provider-registry-and-oauth.md) | Consumer of `providers/` |
| [endoclaw-skill-registry](endoclaw-skill-registry.md) | Daemon-side counterpart for skills |

## Phased implementation

1. **Manifest read + skill installs.** `endo install` recognizes
   `endo.skills`, drops content into the discovery path.
2. **Prompt + provider kinds.** Same shape, more directories.
3. **`endo list packages` + `endo remove`.** Lifecycle.
4. **`endo config` for enable/disable.** Disable a package without
   uninstalling.
5. **Pinning + updates.** `endo install npm:@foo/bar@1.2.3`
   semantics, `endo update`.

## Out of scope

- **Centralized registry.** Pi browses npm with a keyword search. Endo
  follows the same npm convention (`keywords: ["endo-package"]`); a
  registry is unnecessary and would add a moderation surface Endo does
  not want to operate.
- **Backwards-incompatible manifest changes.** The manifest is
  forward-compatible by design (unknown keys are ignored), so we never
  need a v2 manifest.

## Citation

- [`packages/coding-agent/docs/packages.md`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/packages.md)
- [`packages/coding-agent/src/core/package-manager.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/package-manager.ts)

## Prompt

> Extracted from [endopi](endopi.md) § *Extension model*. The ergonomic
> piece of Pi's plug-in model worth importing without giving up Endo's
> confinement. One `package.json` keyword, one install command,
> multiple resource kinds.
