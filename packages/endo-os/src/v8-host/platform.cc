// Endo OS V8 Platform implementation
//
// Phase 0: Thin wrapper over v8::platform::NewDefaultPlatform().
// This gives us a working event loop immediately.  Later phases
// will replace this with a custom epoll-based implementation that
// integrates with block device I/O, network interrupts, and
// timer hardware directly.

#include "platform.h"

#include <cstdio>

namespace endo {

std::unique_ptr<v8::Platform> CreateEndoPlatform() {
  // For Phase 0, use V8's default platform with a single thread.
  // The thread count of 1 is intentional: we are PID 1 in a
  // single-process OS.  V8 background compilation and GC tasks
  // share this thread pool.
  //
  // Phase 1+ will replace this with:
  //   - epoll_wait for I/O multiplexing
  //   - timerfd for setTimeout/setInterval
  //   - eventfd for cross-isolate wakeup (worker communication)
  auto platform = v8::platform::NewDefaultPlatform(
      1,  // thread_pool_size
      v8::platform::IdleTaskSupport::kDisabled,
      v8::platform::InProcessStackDumping::kEnabled);

  fprintf(stdout, "endo-init: V8 platform initialized (1 thread)\n");
  return platform;
}

void RunEventLoop(v8::Isolate* isolate, v8::Platform* platform) {
  // Drain microtasks and pending platform tasks.
  // In Phase 0 this completes quickly since there's no async work.
  // In later phases, this becomes the main OS event loop:
  //
  //   while (true) {
  //     epoll_wait(epfd, events, max_events, timeout);
  //     // dispatch I/O completions as resolved promises
  //     // dispatch timer expirations as setTimeout callbacks
  //     // run V8 microtask checkpoint
  //     v8::platform::PumpMessageLoop(platform, isolate);
  //   }

  while (v8::platform::PumpMessageLoop(platform, isolate)) {
    isolate->PerformMicrotaskCheckpoint();
  }

  // Final microtask flush.
  isolate->PerformMicrotaskCheckpoint();

  fprintf(stdout, "endo-init: Event loop drained\n");
}

}  // namespace endo
