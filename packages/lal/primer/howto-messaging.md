# How-To: Messaging and Conversation Management

Messages are how agents and users communicate in Endo. Each
message has a number, sender, type, and optional attached
values.

## Sending Messages

Type the recipient's name followed by the message:

```
@alice Hello, how are you?
@lal Please review my project.
```

To include a capability in the message, embed its pet name:

```
@lal Here is @project-dir for you to work with.
```

The recipient can adopt the embedded capability.

## Replying to a Message

```
/reply 5 Thanks for the update!
```

## Managing Conversation Context

Agents accumulate context as conversations grow. To keep
interactions focused:

**Start a new conversation**: Create a fresh guest to get a
clean slate. The agent's primer and tools carry over, but
prior messages do not.

**Reply to a specific message**: Use `/reply <msgnum>` to
continue from a particular point. This is useful when a
thread has branched and you want to pick up from the message
that captures all the relevant context without the noise of
subsequent back-and-forth.

**Dismiss stale messages**: Clean up your inbox to reduce
clutter:
```
/dismiss 5
/clear
```

## Adopting Values from Messages

When someone sends you a message with attached values, adopt
them before use:

```
/adopt 3 counter -n my-counter
```

This takes the value the sender labeled "counter" from message
#3 and stores it as "my-counter" in your inventory.

## Requesting a Capability

Ask another agent for something:

```
/request @host I need read access to the database
```

The recipient can grant or deny the request.

## Granting and Denying Requests

```
/resolve 7 my-database
/reject 7
```

## Sending Forms

Forms collect structured input from another party:

```
/form @recipient
```

Chat opens a form builder where you define the fields. The
recipient fills in and submits.

## CLI Notes

Most messaging operations are available in Chat. The CLI
equivalents (`endo send`, `endo reply`, `endo adopt`, etc.)
are useful for scripting and automation but are not needed
for interactive use.
