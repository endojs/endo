# llamadrome

This `@endo/llamadrome` package is an unconfined `@endo/daemon` plugin for
savely empowering LLM-written code.

The LLM agent produces a bank of tool calls
which in turn enable the LLM agent to use Endo Pet
Dæmon Guest capabilities and any capabilities they
can thereby obtain.
Capabilities may be self-describing,
by implementing a help method.

The LLM agent is chatting with a supervisor who is
merely present to indicate to the LLM that they have
new messages. They require no acknowledgement.
They the LLM has standing instructions to
respond to any urging by responding to
messages in their inbox using the Guest capabilities.

