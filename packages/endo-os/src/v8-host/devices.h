// Endo OS Device Capability Bindings
//
// Each device binding exposes Linux kernel hardware as a JavaScript
// capability object.  The pattern for every device:
//
//   1. C++ opens the Linux device (fd or mmap)
//   2. Creates a V8 ObjectTemplate with capability methods
//   3. Returns a JS object that the bootstrap can pass to guest code
//
// Capability discipline: each device object is self-contained.
// There is no global device registry.  If you don't have a
// reference to the object, you can't use the device.

#ifndef ENDO_OS_DEVICES_H_
#define ENDO_OS_DEVICES_H_

#include "v8.h"

namespace endo {
namespace devices {

// Install all device capability constructors as globals.
// Each becomes a function like:
//   const disk = __openBlockDevice('/dev/vda');
//   const net  = __createNetworkInterface();
//   const fb   = __openFramebuffer('/dev/fb0');
//   const cam  = __openCamera('/dev/video0');
//   const mic  = __openMicrophone('hw:0,0');
//
// The bootstrap script calls these, receives the capability
// objects, and passes them (or attenuated facets) to the daemon.
void InstallDeviceBindings(v8::Isolate* isolate,
                           v8::Local<v8::ObjectTemplate> global);

// --- Individual device installers (called by InstallDeviceBindings) ---

void InstallBlockDevice(v8::Isolate* isolate,
                        v8::Local<v8::ObjectTemplate> global);

void InstallNetwork(v8::Isolate* isolate,
                    v8::Local<v8::ObjectTemplate> global);

void InstallFramebuffer(v8::Isolate* isolate,
                        v8::Local<v8::ObjectTemplate> global);

void InstallCamera(v8::Isolate* isolate,
                   v8::Local<v8::ObjectTemplate> global);

void InstallMicrophone(v8::Isolate* isolate,
                       v8::Local<v8::ObjectTemplate> global);

}  // namespace devices
}  // namespace endo

#endif  // ENDO_OS_DEVICES_H_
