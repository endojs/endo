Okay cool so we've got a nascent help system in `packages/daemon/src/help-text.js` .

1. [x] make a basic markdown scanner in `packages/daemon/src/helpdown.js`
  - it should scan header structure:
    - level-1 headers are entities like `EndoDirectory` or `EndoGuest` ; e.g.
    - level-2 headers within them are `methodName`s on each entity for lookup as help sub-sections
  - it should be code fence and block-quote so that it correctly parses header structure
  - comply with commonmark, but we do not need a full scanner or parser

2. [x] use that scanner to implement a `const loadHelpTextFile = (path) => AsyncIterator<[name: string, help: HelpText]>` utility

3. [x] translate all of the help sections from `packages/daemon/src/help-text.js`  into `packages/daemon/src/help.md`, using `loadHelpTextFile`

At the end of this, we should be able to do:
```javascript
// TODO or whatever import meta url stuff it takes to find the right path`
const helpSpecifier = "./help.md";

for await (const [name, help] of loadHelpTextFile(helpSpecifier)) {
  console.log(name); // should see things like "EndoDirectory", "Mail Operations", and "EndoGuest" from the example below
}
```

And the exported shape of the current `help-text.js` module should be the same as it is now.

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
