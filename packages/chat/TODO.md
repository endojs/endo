In the inventory, the hidden buttons are taking up too much space and need to be turned into a pop-out on hover.
Accelerator keys for commands

The Adopt command line has some unwarranted extra
space between the message number and edge name. I
suppose we could call that a link name to be less
confusing.
The edge name field should either a selector
populated with the names in the message, in order,
including duplicates since they can be distinct.
With any change to the selected link name, we should update the chosen pet name to one inferred from the edge name and the pet name of the sender.

Could add upload and download for blobs.

Something about opening and closing directories.

The request message bubble should not need extra quotes anymore.
And, please reuse the markdown variant.

Quasi-markdown support for tables.

(50%) or (1/3) notation for messages, render as pie chart.

## Bugs

### Command line doesn't reset after guest evaluate

When interacting through a guest persona and sending an evaluate message,
pressing Enter does not return the command line to its initial state.

To investigate:
1. How does a guest persona send an evaluate message vs a host?
2. What is the counter-proposal workflow - when a guest sends `/js`, does it
   become a proposal that needs approval?
3. In `chat-bar-component.js`, what code resets the command line after command
   execution?
4. Is there a different code path for guest vs host evaluate that fails to
   reset state?

Relevant files:
- `packages/chat/chat-bar-component.js` - command line state management
- `packages/chat/inline-eval.js` - inline eval form
- `packages/daemon/src/guest.js` - guest persona behavior
- `packages/daemon/src/host.js` - host persona behavior
- `packages/daemon/src/mail.js` - message/evaluate handling

Reproduction:
1. Enter a host profile
2. Create a guest (`/mkguest`)
3. Enter the guest profile (`/enter guest-name`)
4. Run `/js 1 + 1` and press Enter
5. Observe: command line does not reset to initial empty state
