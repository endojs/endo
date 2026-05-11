# EndoClaw: Skills Directory

| | |
|---|---|
| **Created** | 2026-03-03 |
| **Updated** | 2026-03-03 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |
| **Parent** | [endoclaw](endoclaw.md) |

## Summary

A skills directory built on EndoDirectory — the same pet-name storage
system that agents already use for all their references. The skills
directory is a well-known directory where each entry names a skill
descriptor,
and skill descriptors are themselves directories containing the skill's
code, metadata, and capability requirements. Discovery, installation,
and updates use the same `lookup`, `list`, `write`, and
`followNameChanges` operations that every Endo agent already knows.

## Design

### Skills as EndoDirectory

A skills directory is an EndoDirectory published by an operator. The
operator creates the directory, populates it with skill entries, and
shares it (via mail or a well-known locator). Each entry is a pet name
pointing to a skill descriptor:

```
skills/                            (EndoDirectory)
├── gmail-bridge                   → skill descriptor
├── telegram-bridge                → skill descriptor
├── github-notifications           → skill descriptor
├── home-automation                → skill descriptor
└── ...
```

The host adds a skills directory to their namespace:

```bash
endo adopt <skills-message> skills
```

Or, for a built-in skills directory shipped with the Familiar:

```bash
# Already available as a special name
endo list skills
# => gmail-bridge
#    telegram-bridge
#    github-notifications
#    home-automation
```

### Skill descriptors as directories

Each skill descriptor is an EndoDirectory containing the skill's
metadata and code reference. Conventions for entry names:

```
gmail-bridge/                      (EndoDirectory — skill descriptor)
├── code                           → guest module (installable bundle)
├── description                    → string value: "Read and manage Gmail via OAuth"
├── requires                       → directory of capability declarations
│   ├── oauth                      → string value: "gmail"
│   └── network-fetch              → string value: "https://gmail.googleapis.com"
├── version                        → string value: "1.0.0"
├── author                         → string value: "endo-community"
└── homepage                       → string value: "https://github.com/endo-community/gmail-bridge"
```

The `code` entry is the installable guest module — a formula identifier
that `endo install` can resolve. The `requires` subdirectory enumerates
capability categories the skill needs, using pet names as keys and
string values as scope hints.

### Discovery via list and lookup

Discovery uses the standard EndoDirectory API:

```js
// List all skills in a registry
const skills = await E(registry).list();
// => ['gmail-bridge', 'telegram-bridge', ...]

// Look up a skill descriptor
const descriptor = await E(registry).lookup('gmail-bridge');

// Read metadata
const description = await E(descriptor).lookup('description');
const version = await E(descriptor).lookup('version');

// Enumerate requirements
const requires = await E(descriptor).lookup('requires');
const reqNames = await E(requires).list();
// => ['oauth', 'network-fetch']
for (const name of reqNames) {
  const scope = await E(requires).lookup(name);
  console.log(`${name}: ${scope}`);
}
// => oauth: gmail
// => network-fetch: https://gmail.googleapis.com
```

### Installation via adopt and install

Installation composes existing Endo operations — no new verbs:

```bash
# 1. Browse the registry
endo list skills

# 2. Inspect a skill's requirements
endo list skills gmail-bridge requires
# => oauth
#    network-fetch

# 3. Adopt the code reference
endo adopt skills gmail-bridge code gmail-bridge-code

# 4. Install as a guest
endo install gmail-bridge-code --name gmail-bridge

# 5. Grant required capabilities
endo grant gmail-bridge oauth my-gmail-oauth
endo grant gmail-bridge network-fetch gmail-http
```

Or as a single CLI convenience command that wraps these steps:

```bash
endo hub install gmail-bridge --from skills
# => Skill: gmail-bridge — "Read and manage Gmail via OAuth"
#    Requires:
#      oauth (gmail)
#      network-fetch (https://gmail.googleapis.com)
#    Install and grant? [y/N]
```

### Live updates via followNameChanges

A host can subscribe to registry updates using the standard directory
change subscription:

```js
const changes = E(registry).followNameChanges();
for await (const change of changes) {
  if ('add' in change) {
    console.log(`New skill available: ${change.add}`);
  }
  if ('remove' in change) {
    console.log(`Skill removed: ${change.remove}`);
  }
}
```

This lets the Familiar or Chat UI show a notification when new skills
are published, without polling.

### Publishing a skill

A skill author creates a descriptor directory and sends it to the
registry operator:

```bash
# Author creates descriptor
endo make-directory gmail-bridge-descriptor

# Populate metadata
endo store "Read and manage Gmail via OAuth" --name description-text
endo write gmail-bridge-descriptor description description-text

endo store "1.0.0" --name version-text
endo write gmail-bridge-descriptor version version-text

# Set code reference (the installable bundle)
endo write gmail-bridge-descriptor code gmail-bridge-bundle

# Create and populate requirements
endo make-directory gmail-bridge-descriptor requires
endo store "gmail" --name oauth-scope
endo write gmail-bridge-descriptor requires oauth oauth-scope
endo store "https://gmail.googleapis.com" --name fetch-scope
endo write gmail-bridge-descriptor requires network-fetch fetch-scope

# Send to registry operator
endo send registry-operator "Please list gmail-bridge" \
  --attach gmail-bridge-descriptor:gmail-bridge-descriptor
```

The registry operator reviews and adds it:

```bash
endo adopt <message> gmail-bridge-descriptor submitted-gmail-bridge
endo write skills gmail-bridge submitted-gmail-bridge
```

### Federation

Because registries are just directories, federation is natural:

- A host can add multiple registries under different pet names
  (`skills`, `community-hub`, `company-hub`).
- A registry can include entries from other registries by writing
  their formula identifiers — directories are referenceable across
  agents via the formula system.
- A curated registry can `copy` entries from an upstream registry,
  creating a filtered view.

### Built-in registry

The Familiar and Docker image can ship a built-in registry as a
special name (`skills`), populated during daemon initialization with
descriptors for bundled and recommended skills. This uses the same
`Specials` mechanism as `@apps`, `@lal`, and `@fae`.

## Endo Idiom

**No new abstractions.** The registry is an EndoDirectory. Skill
descriptors are EndoDirectories. Metadata entries are string values
stored via `write`. Everything uses the existing pet-name storage
system — `list`, `lookup`, `write`, `followNameChanges`.

**Capability declaration via directory structure.** The `requires`
subdirectory enumerates needed capabilities as pet-name entries. This
is inspectable with the same tools used for any directory (`endo list`,
`E(dir).list()`). No special metadata format or JSON schema is needed.

**Decentralized by default.** Any agent can create a registry directory
and share it. There is no central authority. The built-in `skills` is
a convenience, not a gatekeeper. Users can `endo install` from any
source without going through a registry.

**No ambient authority.** Installing a skill from the registry creates a
confined guest. The skill receives only explicitly granted capabilities.
The `requires` directory informs the host's grant decision but does not
automatically provision capabilities.

**Live discovery.** `followNameChanges` provides real-time notification
of registry updates without polling — the same mechanism the Chat UI
already uses to watch inbox changes.

## Depends On

- EndoDirectory (`packages/daemon/src/directory.js`) — already
  implemented
- Guest plugin infrastructure (`endo install`) — already implemented
- String value storage (`endo store`) — already implemented
- Capability categories being defined enough for meaningful `requires`
  entries
