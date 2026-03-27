// Endo OS Device Capability Bindings — dispatcher
//
// Installs all device capability constructors into the global
// template.  Each device binding registers a __openXxx() or
// __createXxx() function that returns a capability object.

#include "devices.h"

#include <cstdio>

namespace endo {
namespace devices {

void InstallDeviceBindings(v8::Isolate* isolate,
                           v8::Local<v8::ObjectTemplate> global) {
  fprintf(stdout, "endo-init: Installing device capability bindings\n");

  InstallBlockDevice(isolate, global);
  InstallNetwork(isolate, global);
  InstallFramebuffer(isolate, global);
  InstallCamera(isolate, global);
  InstallMicrophone(isolate, global);

  fprintf(stdout,
      "endo-init: Device bindings installed:\n"
      "  __openBlockDevice(path)       → BlockDevice capability\n"
      "  __createNetworkInterface()    → NetworkInterface capability\n"
      "  __openFramebuffer(path)       → Framebuffer capability\n"
      "  __openCamera(path)            → Camera capability\n"
      "  __openMicrophone(device)      → Microphone capability\n");
}

}  // namespace devices
}  // namespace endo
