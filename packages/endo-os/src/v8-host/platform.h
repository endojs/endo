// Endo OS V8 Platform
//
// Minimal v8::Platform implementation for a single-process OS.
// Provides an event loop, task scheduling, and timers backed by
// Linux epoll + timerfd (or bare-metal equivalents later).

#ifndef ENDO_OS_PLATFORM_H_
#define ENDO_OS_PLATFORM_H_

#include <memory>
#include "v8.h"
#include "libplatform/libplatform.h"

namespace endo {

// Create the Endo OS platform.  For Phase 0 this wraps
// v8::platform::NewDefaultPlatform() with minimal customization.
// Later phases replace the internals with epoll-based scheduling.
std::unique_ptr<v8::Platform> CreateEndoPlatform();

// Run the event loop until all pending work is drained.
// In a full OS this runs forever (the daemon is always alive).
void RunEventLoop(v8::Isolate* isolate, v8::Platform* platform);

}  // namespace endo

#endif  // ENDO_OS_PLATFORM_H_
