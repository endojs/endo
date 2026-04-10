- [x] write a test for `packages/daemon/src/helpdown.js`
  - put it in `packages/daemon/test/helpdown.test.js`
  - use AVA similar to other daemon tests in that directory

# Example helpdown file format

~~~markdown
# EndoDirectory - A naming hub for managing pet names and references.

## help(methodName?) -> string

## has(...petNamePath) -> Promise<boolean>

# Mail Operations - Send and receive messages between agents.

## handle() -> Handle

## listMessages() -> Promise<Message[]>

# EndoGuest - A confined agent with directory and mail capabilities.

A guest can:
- Manage pet names for values (directory operations)
- Send and receive messages (mail operations)
- Request capabilities from its host

## help(methodName?) -> string

## define(source, slots) -> Promise<any>

~~~
