# Research the paperclip orchestration system

- <https://docs.paperclip.ing/guides/agent-developer/heartbeat-protocol>
- <https://docs.paperclip.ing/api/overview>
- <https://docs.paperclip.ing/api/issues>
- <https://docs.paperclip.ing/api/goals-and-projects>

Plan a similar system but using:
- endo daemon plugins ; no normal system processes ; no postgres database
- endo/genie for the heatbeat-hire-able agent
- no http/rest interface — ocap interfaces

- [x] Update this task with a design plan
  - [x] if you need further clarification or research, call that out,
        do not speculate
  - do not modify any other files yet

---

## Design Plan: Endo Orchestration System

### Overview

A Paperclip-like agent orchestration system built entirely on Endo
daemon primitives.
Agents discover work, claim tasks, execute, report status, and
delegate — all through ocap interfaces over CapTP, with no REST
endpoints and no external database.

### Concept Mapping: Paperclip → Endo

| Paperclip | Endo Equivalent |
|-----------|-----------------|
| REST API + Bearer tokens | CapTP ocap references (E() calls) |
| Postgres tables | Formula persistence (disk-before-graph) |
| Agent API key / JWT | Guest or Host formula identity (keypair) |
| Company scope | A pet-store namespace per organization |
| Issue (work item) | New `issue` formula type |
| Goal / Project | New `goal` and `project` formula types |
| Heartbeat protocol | Genie heartbeat runner (already exists) |
| Agent run ID | Context.id (FormulaIdentifier) |
| Task checkout (409 lock) | Context-based exclusive claim |
| @-mention triggers | Channel message follower |
| Attachments / documents | ReadableBlob + ReadableTree formulas |
| Priority sorting | Pet-store ordering or issue metadata |

---

### 1. New Formula Types

#### 1a. `issue` formula

Represents a unit of work.
Persistent, capability-bearing, with guarded interface.

```
IssueFormula = {
  type: 'issue',
  title: string,
  description: string,
  status: 'backlog' | 'todo' | 'in_progress' | 'in_review'
          | 'done' | 'cancelled' | 'blocked',
  priority: number,
  assigneeId?: FormulaIdentifier,   // agent (guest/host)
  parentId?: FormulaIdentifier,     // parent issue
  goalId?: FormulaIdentifier,
  projectId?: FormulaIdentifier,
  channelId: FormulaIdentifier,     // for comments
  documents: Map<string, FormulaIdentifier>,  // keyed blobs
}
```

The `issue` exo exposes:

```js
const IssueInterface = M.interface('Issue', {
  help: M.call().returns(M.string()),
  getStatus: M.call().returns(M.string()),
  getDetails: M.call().returns(M.record()),
  update: M.call(M.record()).returns(M.promise()),
  checkout: M.call(M.string()).returns(M.promise()),
  release: M.call().returns(M.promise()),
  getChannel: M.call().returns(M.promise()),
  createSubtask: M.call(M.record()).returns(M.promise()),
  getDocument: M.call(M.string()).returns(M.promise()),
  putDocument: M.call(M.string(), M.string()).returns(M.promise()),
});
```

**Checkout semantics**: `checkout(runId)` atomically sets
`status: 'in_progress'` and records the claiming `runId`.
If already claimed by a different run, rejects with an error
(the ocap equivalent of Paperclip's 409).
No retry — the caller must stop.

#### 1b. `goal` formula

```
GoalFormula = {
  type: 'goal',
  title: string,
  description: string,
  level: 'organization' | 'team' | 'agent',
  status: 'active' | 'completed',
}
```

#### 1c. `project` formula

```
ProjectFormula = {
  type: 'project',
  name: string,
  description: string,
  goalIds: FormulaIdentifier[],
  status: 'planned' | 'in_progress',
  workspaces: Array<{
    name: string,
    mountId: FormulaIdentifier,   // Endo mount formula
    isPrimary: boolean,
  }>,
}
```

Projects use existing `mount` formulas for workspace access rather
than raw filesystem paths.

---

### 2. Orchestrator Plugin (unconfined caplet)

A new unconfined plugin: `orchestrator.js`, exporting `make(powers)`.

Responsibilities:
- Provision and track issues, goals, projects in pet-store namespaces.
- Provide an `OrchestratorInterface` exo as its main capability.
- Manage agent registration and assignment.

```js
const OrchestratorInterface = M.interface('Orchestrator', {
  help: M.call().returns(M.string()),

  // Agent registration
  registerAgent: M.call(M.remotable(), M.record())
    .returns(M.promise()),
  getAgentInfo: M.call().returns(M.promise()),

  // Issue management
  createIssue: M.call(M.record()).returns(M.promise()),
  listIssues: M.call(M.record()).returns(M.promise()),
  getIssue: M.call(M.string()).returns(M.promise()),

  // Goal / project management
  createGoal: M.call(M.record()).returns(M.promise()),
  createProject: M.call(M.record()).returns(M.promise()),
  listGoals: M.call().returns(M.promise()),
  listProjects: M.call().returns(M.promise()),

  // Delegation
  assignIssue: M.call(M.string(), M.string()).returns(M.promise()),
});
```

The orchestrator stores all entities as formulas via
`DaemonCore.formulate()` and indexes them in a dedicated pet-store
namespace (e.g. `orchestrator:issues:123`, `orchestrator:goals:abc`).

---

### 3. Heartbeat Agent (Genie Integration)

Each hireable agent is an Endo guest running the genie heartbeat
runner.
The heartbeat protocol maps to Endo as follows:

| Paperclip Step | Endo Heartbeat Implementation |
|----------------|-------------------------------|
| 1. Identity | `E(orchestrator).getAgentInfo()` |
| 2. Approval follow-up | Check context for pending approval IDs |
| 3. Inbox discovery | `E(orchestrator).listIssues({ assigneeId, status: ['todo', 'in_progress', 'blocked'] })` |
| 4. Work selection | Priority sort; prefer `TASK_ID` from env |
| 5. Checkout | `E(issue).checkout(contextId)` |
| 6. Context review | `E(issue).getDetails()`, `E(issue).getChannel()` then `E(channel).listMessages()` |
| 7. Execute work | Genie tool system (bash, git, filesystem, etc.) |
| 8. Status update | `E(issue).update({ status: 'done' })` + `E(channel).post(comment)` |
| 9. Delegation | `E(orchestrator).createIssue({ parentId, goalId, assigneeId })` |

The genie heartbeat runner already supports:
- Configurable intervals and active hours
- Workspace locking (prevents concurrent runs)
- Timeout with status reporting
- Event emission for monitoring

The agent's `HEARTBEAT.md` would be replaced (or augmented) by the
orchestrator's issue queue — the heartbeat `runOnce()` implementation
queries the orchestrator capability instead of reading a file.

---

### 4. Concurrency and Locking

Paperclip uses `POST /checkout` + `409 Conflict` for exclusive task
ownership.
Endo equivalent:

```js
// Inside makeIssueExo:
let claimedByRunId = null;

const checkout = (runId) => {
  if (claimedByRunId !== null && claimedByRunId !== runId) {
    throw makeError(X`Issue already claimed by run ${q(claimedByRunId)}`);
  }
  claimedByRunId = runId;
  status = 'in_progress';
  // persist updated formula to disk
};

const release = () => {
  claimedByRunId = null;
  // persist
};
```

Because CapTP serializes calls to a given object, the checkout is
inherently atomic — no database-level locking needed.
The daemon's single-threaded event loop guarantees mutual exclusion on
a per-formula basis.

---

### 5. Inter-Agent Communication

Paperclip uses issue comments with @-mentions to trigger agent
heartbeats.
Endo equivalent:

- Each issue has an associated `channel` formula.
- Agents follow the channel via `E(channel).followMessages()`.
- When a message arrives mentioning an agent's pet name, the
  orchestrator wakes the target agent's heartbeat.
- Wake mechanism: the orchestrator holds a reference to each agent's
  heartbeat controller and calls `E(heartbeat).runOnce()`.

---

### 6. Persistence Model

All state lives in the formula graph — no Postgres.

- **Issues, goals, projects** are each formula types persisted via
  `persistencePowers.writeFormula()` before being added to the
  in-memory graph.
- **Status transitions** update the formula on disk, then update the
  in-memory representation.
- **Indexes** (by assignee, by status, by project) are maintained in
  pet-store namespaces, which are themselves persisted formulas.
  Example: `issues-by-agent:{agentId}` is a directory formula
  containing pet-name references to the agent's assigned issues.

Formula GC: issues pin their dependencies (channel, documents,
sub-issues).
Completed/cancelled issues can be unpinned to allow collection.

---

### 7. Capability Graph

```
                 ┌──────────────┐
                 │ Orchestrator │  (unconfined plugin)
                 └──────┬───────┘
                        │ provides capabilities to
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
     ┌─────────┐  ┌─────────┐  ┌──────────┐
     │ Agent A │  │ Agent B │  │ Agent C  │
     │ (guest) │  │ (guest) │  │ (guest)  │
     └────┬────┘  └────┬────┘  └────┬─────┘
          │             │            │
          ▼             ▼            ▼
     ┌─────────┐  ┌─────────┐  ┌─────────┐
     │ Genie   │  │ Genie   │  │ Genie   │
     │Heartbeat│  │Heartbeat│  │Heartbeat│
     └─────────┘  └─────────┘  └─────────┘
```

Each agent receives only:
- A reference to the orchestrator (to discover and manage work)
- References to issues assigned to them (returned by listIssues)
- Mount references for workspaces (via project formulas)
- Their own channel for receiving messages

Agents cannot access each other's issues or workspaces unless
explicitly granted — least-authority by construction.

---

### 8. Implementation Phases

**Phase 1 — Formula types and orchestrator plugin**
- Define `issue`, `goal`, `project` formula types in
  `packages/daemon/src/formula-type.js` and `types.d.ts`.
- Implement `makeIssue`, `makeGoal`, `makeProject` makers in
  `packages/daemon/src/`.
- Build the orchestrator unconfined plugin.
- Wire up `DaemonCore.formulateIssue()` etc.

**Phase 2 — Heartbeat integration**
- Extend genie heartbeat runner to accept an orchestrator capability.
- Implement the 9-step heartbeat protocol as an Endo-native sequence.
- Agent provisioning: CLI commands or host methods to register an
  agent with the orchestrator and start its heartbeat.

**Phase 3 — Inter-agent communication**
- Channel-based comment system per issue.
- @-mention parsing and agent wake triggers.
- Delegation (subtask creation with parent/goal lineage).

**Phase 4 — Lifecycle and observability**
- Issue status transition guards (valid state machine).
- Event followers for dashboards (`followNameChanges` on issue
  namespaces).
- GC policy for completed work items.

---

### Open Questions / Needs Clarification

1. **Formula mutability**: Current formulas appear to be immutable
   once written (content-addressed by SHA256).
   Issue status must change over time.
   Need to confirm: does the daemon support mutable formula state,
   or would issues need a different persistence mechanism
   (e.g., a `scratch-mount` or a `synced-pet-store`)?

2. **Genie heartbeat extensibility**: The current heartbeat runner
   reads `HEARTBEAT.md` for task discovery.
   Need to confirm: can `runOnce()` be overridden or composed with
   a custom task-discovery function, or does it need a refactor to
   accept a pluggable task source?

3. **Agent wake-on-mention**: Paperclip triggers agent heartbeats
   via @-mentions in comments.
   The channel `followMessages()` async iterable could drive this,
   but need to confirm: is there a mechanism to wake a sleeping
   genie heartbeat from outside its interval timer?

4. **Multi-node**: Paperclip is a centralized server.
   Endo supports multi-node CapTP (peer formulas, known-peers-store).
   Should the orchestrator support distributed agents across Endo
   nodes, or is single-node sufficient for v1?

5. **Billing/token budget**: Paperclip tracks token budgets per agent.
   Should this be modeled as a formula-level concern, or deferred?
