# Work on @endo/genie — refactor searchInFile

1. rework `searchInFile` in `packages/genie/src/tools/memory.js` circa line 53
  - [x] make it use a streaming file handle, do not read the entire file in one buffer
  - [x] may make sense to use a notional "spliterator" that takes a raw stream chunk iterator, and yields whole lines, including any final partial one

2. similarly update `memoryGet` the file read that goes thru a temporary `linesArr` just to return a from:to range slice:
  - [x] have it use the streaming file reader made above
  - [x] and just keep a line count while iterating thru it, collecting only the desired lines into a result array
