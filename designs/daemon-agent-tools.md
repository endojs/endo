# Daemon Agent Tools (Claw-like Capabilities)

| | |
|---|---|
| **Created** | 2026-03-02 |
| **Updated** | 2026-03-02 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |

## What is the Problem Being Solved?

AI coding agents like Claude Code ("Claw"), Cursor, and Devin have a
standard set of tools: read files, write files, execute shell commands,
run git operations, search codebases. These tools operate with ambient
authority — the agent has the same filesystem and process access as the
user running it.

Endo's capability model can provide these same tools with principled
confinement: an agent receives a `Dir` capability scoped to a project
directory, a `Shell` capability that can only execute approved commands,
and a `Git` capability scoped to a repository. The agent can do useful
coding work without ambient access to `~/.ssh`, `~/.aws`, or the ability
to run arbitrary network commands.

This design bridges the capability system designs
([daemon-capability-filesystem](daemon-capability-filesystem.md),
[daemon-capability-bank](daemon-capability-bank.md)) with the concrete
tools an AI agent uses for coding assistance. It defines the tool
interface that Lal and Fae register when granted these capabilities.

## Design

### Tool categories

An agent with coding capabilities needs four tool groups:

| Group | Capability | Tools |
|-------|-----------|-------|
| Filesystem | `Dir` | `readFile`, `writeFile`, `listDir`, `glob`, `stat` |
| Shell | `Shell` | `exec`, `execInteractive` |
| Git | `Git` | `status`, `diff`, `log`, `add`, `commit`, `checkout`, `branch` |
| Search | `Dir` | `grep`, `glob` (reuses filesystem) |

### Filesystem tools

Backed by the `Dir` capability from
[daemon-capability-filesystem](daemon-capability-filesystem.md). The
agent receives a `Dir` rooted at the project directory and registers
tools that delegate to its methods.

```js
const registerFsTools = (tools, dir) => {
  tools.register('readFile', async ({ path }) => {
    const segments = path.split('/');
    let current = dir;
    for (const seg of segments.slice(0, -1)) {
      current = await E(current).openDir(seg);
    }
    const file = await E(current).openFile(segments.at(-1));
    return E(file).readText();
  });

  tools.register('writeFile', async ({ path, content }) => {
    // Similar navigation to parent dir, then writeText
  });

  tools.register('listDir', async ({ path }) => {
    let target = dir;
    if (path) {
      target = await E(dir).subDir(path);
    }
    return E(target).list();
  });

  tools.register('glob', async ({ pattern }) => {
    return E(dir).glob(pattern);
  });
};
```

The `Dir` capability provides structural confinement — the agent cannot
navigate above the project root, cannot access `~/.ssh` or `~/.aws`,
and cannot follow symlinks that escape the mount boundary.

### Shell capability

A `Shell` capability wraps `child_process` execution with confinement.
The host constructs the shell with an allowlist of commands and a working
directory:

```js
const shell = makeShell({
  cwd: '/home/user/project',
  allowedCommands: harden([
    'node', 'npm', 'npx', 'yarn',
    'python', 'python3', 'pip',
    'make', 'cargo', 'go',
    'grep', 'find', 'sed', 'awk',
    'curl',  // may be restricted to specific hosts
  ]),
  env: filteredEnv,  // no secrets
  timeout: 60_000,
  maxOutputBytes: 1_048_576,
});
```

The shell interface:

```ts
interface Shell {
  exec(command: string, args: string[]): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }>;
  help(): string;
}
```

The `Shell` exo validates that the command is in the allowlist before
execution. Arguments are passed as an array (no shell expansion) to
prevent injection.

```js
const ShellI = M.interface('Shell', {
  exec: M.call(M.string(), M.arrayOf(M.string()))
    .returns(M.promise(M.splitRecord({
      stdout: M.string(),
      stderr: M.string(),
      exitCode: M.number(),
    }))),
  help: M.call().returns(M.string()),
});
```

### Git capability

A `Git` capability wraps git operations scoped to a repository:

```ts
interface Git {
  status(): Promise<string>;
  diff(args?: string[]): Promise<string>;
  log(args?: string[]): Promise<string>;
  add(paths: string[]): Promise<void>;
  commit(message: string): Promise<string>;
  checkout(ref: string): Promise<void>;
  branch(args?: string[]): Promise<string>;
  help(): string;
}
```

The `Git` exo executes git commands in the repository directory. It does
NOT expose:
- `git push` / `git pull` (network access is a separate capability)
- `git config` (prevents setting hooks or aliases)
- `git hook` (prevents persistence attacks)
- Raw `git` command execution (all operations are method calls with
  validated arguments)

```js
const GitI = M.interface('Git', {
  status: M.call().returns(M.promise(M.string())),
  diff: M.call().optional(M.arrayOf(M.string())).returns(M.promise(M.string())),
  log: M.call().optional(M.arrayOf(M.string())).returns(M.promise(M.string())),
  add: M.call(M.arrayOf(M.string())).returns(M.promise(M.undefined())),
  commit: M.call(M.string()).returns(M.promise(M.string())),
  checkout: M.call(M.string()).returns(M.promise(M.undefined())),
  branch: M.call().optional(M.arrayOf(M.string())).returns(M.promise(M.string())),
  help: M.call().returns(M.string()),
});
```

### Capability granting

The host grants coding capabilities to an agent via the existing
pet-name mechanism:

```bash
# Grant project directory access
endo grant fae fs /home/user/project

# Grant shell access with defaults
endo grant fae shell /home/user/project

# Grant git access
endo grant fae git /home/user/project
```

Or programmatically in a setup module:

```js
const dir = await E(powers).makeDir('/home/user/project');
const shell = await E(powers).makeShell({
  cwd: '/home/user/project',
});
const git = await E(powers).makeGit('/home/user/project');

await E(powers).grant('fae', 'fs', dir);
await E(powers).grant('fae', 'shell', shell);
await E(powers).grant('fae', 'git', git);
```

### Agent tool discovery

When an agent (Lal or Fae) starts, it checks its namespace for known
capability names and dynamically registers tools:

```js
const setup = async (powers) => {
  const tools = makeToolRegistry();

  // Always available: messaging tools
  registerMessageTools(tools, powers);

  // Conditionally available: coding tools
  try {
    const dir = await E(powers).lookup('fs');
    registerFsTools(tools, dir);
  } catch {
    // No filesystem capability granted — skip
  }

  try {
    const shell = await E(powers).lookup('shell');
    registerShellTools(tools, shell);
  } catch {
    // No shell capability granted — skip
  }

  try {
    const git = await E(powers).lookup('git');
    registerGitTools(tools, git);
  } catch {
    // No git capability granted — skip
  }

  return tools;
};
```

This means an agent's tool set is determined by the capabilities
granted to it. An agent with only `fs` can read and write files but
cannot execute commands. An agent with `fs` + `git` but no `shell` can
do file operations and git operations but cannot run arbitrary processes.

### Form-based capability provisioning

Building on [lal-fae-form-provisioning](lal-fae-form-provisioning.md),
the manager agent can include capability grants in its provisioning form:

```js
await E(powers).form('HOST', 'Configure agent workspace', [
  { name: 'name', label: 'Agent name' },
  { name: 'host', label: 'API host', example: 'https://api.anthropic.com' },
  { name: 'model', label: 'Model name', example: 'claude-sonnet-4-6-20250514' },
  { name: 'authToken', label: 'API auth token' },
  { name: 'projectPath', label: 'Project directory', example: '/home/user/project' },
  { name: 'capabilities', label: 'Capabilities', example: 'fs,shell,git' },
]);
```

When the form is submitted, the manager creates the appropriate
capabilities and grants them to the new worker agent.

## Dependencies

| Design | Relationship |
|--------|-------------|
| [daemon-capability-filesystem](daemon-capability-filesystem.md) | Provides `Dir` and `File` capabilities |
| [daemon-capability-bank](daemon-capability-bank.md) | Framework for capability categories |
| [lal-fae-form-provisioning](lal-fae-form-provisioning.md) | Manager/worker architecture for agent setup |
| [daemon-os-sandbox-plugin](daemon-os-sandbox-plugin.md) | OS-level process confinement for `Shell` |

## Phased implementation

### Phase 1: Filesystem tools (depends on daemon-capability-filesystem)

Implement `Dir`-backed filesystem tools in Lal/Fae. The `Dir` capability
from the filesystem design provides the foundation. This alone gives
agents useful file browsing and editing capabilities.

### Phase 2: Shell capability

Implement the `Shell` exo with command allowlist. This can start simple
(hardcoded allowlist) and evolve to configurable allowlists. The OS
sandbox plugin design can later provide true process isolation.

### Phase 3: Git capability

Implement the `Git` exo. This is largely a wrapper around `child_process`
git commands with argument validation and method-level guards.

### Phase 4: Integration and discovery

Wire up dynamic tool discovery so agents automatically register tools
based on granted capabilities. Update the form-based provisioning to
include capability configuration.

## Design Decisions

1. **Capabilities, not configurations.** The agent receives a `Dir`
   object, not a "filesystem access descriptor." It cannot name paths
   outside the `Dir`'s root because no method returns a reference to
   them.

2. **Dynamic tool registration.** Agents discover capabilities at
   startup by looking up known names in their namespace. This means
   the same agent code works with or without coding capabilities —
   it simply has fewer tools available.

3. **Git without push.** The `Git` capability deliberately excludes
   network operations. Pushing requires a separate network capability.
   This prevents data exfiltration via `git push` to an attacker's
   remote.

4. **Shell is array-based.** Commands are passed as `(command, args[])`
   tuples, never as shell strings. This prevents shell injection and
   makes the allowlist enforceable.

5. **Phased approach.** Filesystem tools are the most immediately useful
   and have the fewest security concerns (structural confinement via
   `Dir`). Shell and git capabilities are progressively harder to
   confine safely.

## Related Designs

- [daemon-capability-filesystem](daemon-capability-filesystem.md) —
  `Dir` and `File` capabilities used by filesystem tools.
- [daemon-capability-bank](daemon-capability-bank.md) — capability
  framework and category taxonomy.
- [daemon-os-sandbox-plugin](daemon-os-sandbox-plugin.md) — OS-level
  process confinement for shell execution.
- [lal-fae-form-provisioning](lal-fae-form-provisioning.md) — form-based
  agent setup that can include capability grants.
