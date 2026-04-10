# Notification Protocol

Pivoker sends structured JSON notifications at lifecycle boundaries during agent evocations.

The `NOTIFY` config variable controls the delivery backend; when empty, notifications print to stdout.

## Backends

The `NOTIFY` variable selects the delivery backend:

| Value                       | Behaviour                                                |
|-----------------------------|----------------------------------------------------------|
| *(empty)*                   | Print `NOTIFY: <message>` to stdout; no JSON is built    |
| `http://…` / `https://…`    | POST the JSON body with `Content-Type: application/json` |
| `file:///path`              | Write JSON to path — dispatches by file type:            |
|                             | - regular file (append)                                  |
|                             | - directory (timestamped `.json` files)                  |
|                             | - named pipe / socket (single write)                     |
| Path to a repo-local script | Delegate entirely:                                       |
|                             | - `notify.sh` execs the script                           |
|                             | - forwarding all `--key value` params and the message    |

## JSON Body

Every notification is a flat JSON object; the standard fields are:

| Field       | Type   | Source                         | Description                                |
|-------------|--------|--------------------------------|--------------------------------------------|
| `time`      | string | `date -u -Iseconds`            | UTC ISO 8601 timestamp of the notification |
| `message`   | string | positional args to `notify.sh` | Free-form message string                   |
| `sender`    | string | `AGENT_IDENTITY` config var    | System identity of the sending agent       |
| `level`     | string | message urgency level          | Urency level like: info, alert, or error   |
| `status`    | string | first arg to `notify()`        | Lifecycle status — see table below         |
| `repo-name` | string | `REPO_NAME`                    | Sanitized name slug from directoy suffix   |

Any additional `--param value` pairs given are passed along as additional fields.

### Status Types

| Status    | Emitted when                                | Meaning                                                |
|-----------|---------------------------------------------|--------------------------------------------------------|
| `error`   | `die()` is called                           | A fatal error occurred; the agent is exiting           |
| `running` | Task or direct invocation begins            | Agent is now executing work                            |
| `done`    | Execution completes with no remaining tasks | Agent finished; queue is empty                         |
| `next`    | A task completes but more tasks remain      | Agent finished current task; next task evoke scheduled |

### Example

```json
{
  "time": "2026-03-21T16:30:45+00:00",
  "message": "bla bla bla ...",
  "sender": "username@hostname",
  "status": "running"
}
```
