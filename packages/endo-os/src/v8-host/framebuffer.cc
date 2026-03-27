// Framebuffer (Display) Capability Binding
//
// Exposes the Linux framebuffer (/dev/fb0) as a drawable surface
// capability.  This is the OS's display output — in Phase 5 it
// renders the chat shell directly to the screen.
//
// The framebuffer is memory-mapped: writes to the backing
// ArrayBuffer appear on screen immediately (or after flip()).
//
// JS API:
//   const display = __openFramebuffer('/dev/fb0');
//   display.width();                    // → number (pixels)
//   display.height();                   // → number (pixels)
//   display.bpp();                      // → number (bits per pixel)
//   display.buffer();                   // → Uint8Array (mmap'd)
//   display.setPixel(x, y, r, g, b);   // convenience
//   display.fillRect(x, y, w, h, r, g, b);
//   display.flip();                     // sync to display
//   display.help();

#include "devices.h"

#include <cstdio>
#include <cstring>
#include <fcntl.h>
#include <unistd.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <linux/fb.h>

namespace endo {
namespace devices {

// Internal state for a framebuffer device.
struct FramebufferState {
  int fd;
  uint8_t* mmap_addr;
  size_t mmap_size;
  uint32_t width;
  uint32_t height;
  uint32_t bpp;         // bits per pixel
  uint32_t line_length; // bytes per scanline
};

static FramebufferState* GetFbState(
    const v8::FunctionCallbackInfo<v8::Value>& info) {
  v8::Local<v8::Object> self = info.This();
  v8::Local<v8::External> wrap =
      v8::Local<v8::External>::Cast(self->GetInternalField(0));
  return static_cast<FramebufferState*>(wrap->Value());
}

static void FbWidth(const v8::FunctionCallbackInfo<v8::Value>& info) {
  info.GetReturnValue().Set(static_cast<double>(GetFbState(info)->width));
}

static void FbHeight(const v8::FunctionCallbackInfo<v8::Value>& info) {
  info.GetReturnValue().Set(static_cast<double>(GetFbState(info)->height));
}

static void FbBpp(const v8::FunctionCallbackInfo<v8::Value>& info) {
  info.GetReturnValue().Set(static_cast<double>(GetFbState(info)->bpp));
}

// display.buffer() → Uint8Array backed by mmap'd framebuffer
static void FbBuffer(const v8::FunctionCallbackInfo<v8::Value>& info) {
  v8::Isolate* isolate = info.GetIsolate();
  v8::HandleScope handle_scope(isolate);
  FramebufferState* state = GetFbState(info);

  // Create an ArrayBuffer backed by the mmap'd framebuffer memory.
  // Writes to this buffer appear on screen.
  std::unique_ptr<v8::BackingStore> backing =
      v8::ArrayBuffer::NewBackingStore(
          state->mmap_addr, state->mmap_size,
          [](void*, size_t, void*) { /* mmap'd, don't free */ },
          nullptr);

  v8::Local<v8::ArrayBuffer> buffer =
      v8::ArrayBuffer::New(isolate, std::move(backing));
  info.GetReturnValue().Set(
      v8::Uint8Array::New(buffer, 0, state->mmap_size));
}

// display.setPixel(x, y, r, g, b)
static void FbSetPixel(const v8::FunctionCallbackInfo<v8::Value>& info) {
  v8::Isolate* isolate = info.GetIsolate();
  if (info.Length() < 5) return;

  FramebufferState* state = GetFbState(info);
  auto ctx = isolate->GetCurrentContext();
  uint32_t x = info[0]->Uint32Value(ctx).FromMaybe(0);
  uint32_t y = info[1]->Uint32Value(ctx).FromMaybe(0);
  uint8_t r = static_cast<uint8_t>(info[2]->Uint32Value(ctx).FromMaybe(0));
  uint8_t g = static_cast<uint8_t>(info[3]->Uint32Value(ctx).FromMaybe(0));
  uint8_t b = static_cast<uint8_t>(info[4]->Uint32Value(ctx).FromMaybe(0));

  if (x >= state->width || y >= state->height) return;

  uint32_t bytes_pp = state->bpp / 8;
  size_t offset = y * state->line_length + x * bytes_pp;

  // Assume BGRA32 layout (common for Linux framebuffer).
  if (bytes_pp >= 3) {
    state->mmap_addr[offset + 0] = b;
    state->mmap_addr[offset + 1] = g;
    state->mmap_addr[offset + 2] = r;
    if (bytes_pp == 4) {
      state->mmap_addr[offset + 3] = 0xFF; // alpha
    }
  }
}

// display.fillRect(x, y, w, h, r, g, b)
static void FbFillRect(const v8::FunctionCallbackInfo<v8::Value>& info) {
  v8::Isolate* isolate = info.GetIsolate();
  if (info.Length() < 7) return;

  FramebufferState* state = GetFbState(info);
  auto ctx = isolate->GetCurrentContext();
  uint32_t rx = info[0]->Uint32Value(ctx).FromMaybe(0);
  uint32_t ry = info[1]->Uint32Value(ctx).FromMaybe(0);
  uint32_t rw = info[2]->Uint32Value(ctx).FromMaybe(0);
  uint32_t rh = info[3]->Uint32Value(ctx).FromMaybe(0);
  uint8_t r = static_cast<uint8_t>(info[4]->Uint32Value(ctx).FromMaybe(0));
  uint8_t g = static_cast<uint8_t>(info[5]->Uint32Value(ctx).FromMaybe(0));
  uint8_t b = static_cast<uint8_t>(info[6]->Uint32Value(ctx).FromMaybe(0));

  uint32_t bytes_pp = state->bpp / 8;

  for (uint32_t y = ry; y < ry + rh && y < state->height; y++) {
    for (uint32_t x = rx; x < rx + rw && x < state->width; x++) {
      size_t offset = y * state->line_length + x * bytes_pp;
      if (bytes_pp >= 3) {
        state->mmap_addr[offset + 0] = b;
        state->mmap_addr[offset + 1] = g;
        state->mmap_addr[offset + 2] = r;
        if (bytes_pp == 4) state->mmap_addr[offset + 3] = 0xFF;
      }
    }
  }
}

// display.flip() — explicit sync
static void FbFlip(const v8::FunctionCallbackInfo<v8::Value>& info) {
  FramebufferState* state = GetFbState(info);
  msync(state->mmap_addr, state->mmap_size, MS_SYNC);
}

static void FbHelp(const v8::FunctionCallbackInfo<v8::Value>& info) {
  info.GetReturnValue().Set(v8::String::NewFromUtf8Literal(
      info.GetIsolate(),
      "Framebuffer capability: width(), height(), bpp(), buffer(), "
      "setPixel(x,y,r,g,b), fillRect(x,y,w,h,r,g,b), flip()"));
}

// __openFramebuffer(path) → Framebuffer capability
static void OpenFramebuffer(
    const v8::FunctionCallbackInfo<v8::Value>& info) {
  v8::Isolate* isolate = info.GetIsolate();
  v8::HandleScope handle_scope(isolate);

  const char* path = "/dev/fb0";
  v8::String::Utf8Value custom_path(isolate, info[0]);
  if (info.Length() >= 1 && info[0]->IsString()) {
    path = *custom_path;
  }

  int fd = open(path, O_RDWR);
  if (fd < 0) {
    char msg[256];
    snprintf(msg, sizeof(msg), "Failed to open framebuffer: %s", path);
    isolate->ThrowException(v8::Exception::Error(
        v8::String::NewFromUtf8(isolate, msg,
                                v8::NewStringType::kNormal)
            .ToLocalChecked()));
    return;
  }

  // Query screen geometry.
  struct fb_var_screeninfo vinfo;
  struct fb_fix_screeninfo finfo;
  if (ioctl(fd, FBIOGET_VSCREENINFO, &vinfo) < 0 ||
      ioctl(fd, FBIOGET_FSCREENINFO, &finfo) < 0) {
    close(fd);
    isolate->ThrowException(v8::Exception::Error(
        v8::String::NewFromUtf8Literal(isolate,
            "Failed to query framebuffer info")));
    return;
  }

  size_t mmap_size = finfo.smem_len;
  uint8_t* mmap_addr = static_cast<uint8_t*>(
      mmap(nullptr, mmap_size, PROT_READ | PROT_WRITE,
           MAP_SHARED, fd, 0));
  if (mmap_addr == MAP_FAILED) {
    close(fd);
    isolate->ThrowException(v8::Exception::Error(
        v8::String::NewFromUtf8Literal(isolate,
            "Failed to mmap framebuffer")));
    return;
  }

  // Allocate persistent state.
  auto* state = new FramebufferState{
    fd, mmap_addr, mmap_size,
    vinfo.xres, vinfo.yres,
    vinfo.bits_per_pixel, finfo.line_length
  };

  fprintf(stdout,
      "endo-init: Framebuffer %s: %ux%u @ %ubpp (%zu bytes)\n",
      path, state->width, state->height, state->bpp, mmap_size);

  // Build capability object.
  v8::Local<v8::ObjectTemplate> tmpl = v8::ObjectTemplate::New(isolate);
  tmpl->SetInternalFieldCount(1);

  auto Set = [&](const char* name, v8::FunctionCallback cb) {
    tmpl->Set(v8::String::NewFromUtf8(isolate, name,
                                      v8::NewStringType::kNormal)
                  .ToLocalChecked(),
              v8::FunctionTemplate::New(isolate, cb));
  };

  Set("width", FbWidth);
  Set("height", FbHeight);
  Set("bpp", FbBpp);
  Set("buffer", FbBuffer);
  Set("setPixel", FbSetPixel);
  Set("fillRect", FbFillRect);
  Set("flip", FbFlip);
  Set("help", FbHelp);

  v8::Local<v8::Object> obj =
      tmpl->NewInstance(isolate->GetCurrentContext()).ToLocalChecked();
  obj->SetInternalField(0, v8::External::New(isolate, state));

  info.GetReturnValue().Set(obj);
}

void InstallFramebuffer(v8::Isolate* isolate,
                        v8::Local<v8::ObjectTemplate> global) {
  global->Set(
      v8::String::NewFromUtf8Literal(isolate, "__openFramebuffer"),
      v8::FunctionTemplate::New(isolate, OpenFramebuffer));
}

}  // namespace devices
}  // namespace endo
