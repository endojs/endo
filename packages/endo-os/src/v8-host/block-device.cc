// Block Device Capability Binding
//
// Exposes a Linux block device (e.g., /dev/vda via virtio-blk) as
// a JavaScript capability object with read/write/size methods.
//
// This replaces the entire POSIX filesystem stack.  The Endo daemon
// uses a content-addressed store built directly on block I/O —
// no ext4, no inodes, no file permissions.
//
// JS API:
//   const disk = __openBlockDevice('/dev/vda');
//   const data = disk.read(offset, length);    // → Uint8Array
//   disk.write(offset, uint8array);            // → undefined
//   const bytes = disk.size();                 // → number
//   disk.sync();                               // flush to hardware
//   disk.help();                               // → description string

#include "devices.h"

#include <cstdio>
#include <cstring>
#include <fcntl.h>
#include <unistd.h>
#include <sys/ioctl.h>
#include <sys/stat.h>
#include <linux/fs.h>

namespace endo {
namespace devices {

// Store the fd in the JS object's internal field.
static const int kBlockDeviceInternalFieldCount = 1;

// Get the fd from the JS object's internal field.
static int GetFd(const v8::FunctionCallbackInfo<v8::Value>& info) {
  v8::Local<v8::Object> self = info.This();
  v8::Local<v8::External> wrap =
      v8::Local<v8::External>::Cast(self->GetInternalField(0));
  return static_cast<int>(reinterpret_cast<intptr_t>(wrap->Value()));
}

// disk.read(offset, length) → Uint8Array
static void BlockRead(const v8::FunctionCallbackInfo<v8::Value>& info) {
  v8::Isolate* isolate = info.GetIsolate();
  v8::HandleScope handle_scope(isolate);

  if (info.Length() < 2 || !info[0]->IsNumber() || !info[1]->IsNumber()) {
    isolate->ThrowException(v8::Exception::TypeError(
        v8::String::NewFromUtf8Literal(isolate,
            "read(offset, length): both arguments must be numbers")));
    return;
  }

  int fd = GetFd(info);
  int64_t offset = info[0]->IntegerValue(isolate->GetCurrentContext())
                       .FromMaybe(0);
  int64_t length = info[1]->IntegerValue(isolate->GetCurrentContext())
                       .FromMaybe(0);

  if (length <= 0 || length > 64 * 1024 * 1024) {
    isolate->ThrowException(v8::Exception::RangeError(
        v8::String::NewFromUtf8Literal(isolate,
            "read length must be between 1 and 64MB")));
    return;
  }

  // Create a backing store for the result.
  std::unique_ptr<v8::BackingStore> backing =
      v8::ArrayBuffer::NewBackingStore(isolate, static_cast<size_t>(length));

  ssize_t n = pread(fd, backing->Data(),
                    static_cast<size_t>(length),
                    static_cast<off_t>(offset));
  if (n < 0) {
    isolate->ThrowException(v8::Exception::Error(
        v8::String::NewFromUtf8Literal(isolate, "block device read failed")));
    return;
  }

  // Wrap in ArrayBuffer → Uint8Array.
  v8::Local<v8::ArrayBuffer> buffer =
      v8::ArrayBuffer::New(isolate, std::move(backing));
  v8::Local<v8::Uint8Array> result =
      v8::Uint8Array::New(buffer, 0, static_cast<size_t>(n));

  info.GetReturnValue().Set(result);
}

// disk.write(offset, data) → undefined
static void BlockWrite(const v8::FunctionCallbackInfo<v8::Value>& info) {
  v8::Isolate* isolate = info.GetIsolate();
  v8::HandleScope handle_scope(isolate);

  if (info.Length() < 2 || !info[0]->IsNumber() ||
      !info[1]->IsTypedArray()) {
    isolate->ThrowException(v8::Exception::TypeError(
        v8::String::NewFromUtf8Literal(isolate,
            "write(offset, data): offset must be number, "
            "data must be TypedArray")));
    return;
  }

  int fd = GetFd(info);
  int64_t offset = info[0]->IntegerValue(isolate->GetCurrentContext())
                       .FromMaybe(0);

  v8::Local<v8::TypedArray> typed_array =
      v8::Local<v8::TypedArray>::Cast(info[1]);
  size_t byte_length = typed_array->ByteLength();
  size_t byte_offset = typed_array->ByteOffset();
  v8::Local<v8::ArrayBuffer> buffer = typed_array->Buffer();
  const uint8_t* data =
      static_cast<const uint8_t*>(buffer->GetBackingStore()->Data()) +
      byte_offset;

  ssize_t n = pwrite(fd, data, byte_length, static_cast<off_t>(offset));
  if (n < 0 || static_cast<size_t>(n) != byte_length) {
    isolate->ThrowException(v8::Exception::Error(
        v8::String::NewFromUtf8Literal(isolate,
            "block device write failed")));
    return;
  }
}

// disk.size() → number (total bytes)
static void BlockSize(const v8::FunctionCallbackInfo<v8::Value>& info) {
  v8::Isolate* isolate = info.GetIsolate();
  int fd = GetFd(info);

  uint64_t size = 0;
  if (ioctl(fd, BLKGETSIZE64, &size) < 0) {
    // Fall back to stat for regular files (development).
    struct stat st;
    if (fstat(fd, &st) == 0) {
      size = static_cast<uint64_t>(st.st_size);
    }
  }

  info.GetReturnValue().Set(v8::Number::New(isolate, static_cast<double>(size)));
}

// disk.sync() → undefined (flush to hardware)
static void BlockSync(const v8::FunctionCallbackInfo<v8::Value>& info) {
  int fd = GetFd(info);
  fsync(fd);
}

// disk.help() → string
static void BlockHelp(const v8::FunctionCallbackInfo<v8::Value>& info) {
  v8::Isolate* isolate = info.GetIsolate();
  info.GetReturnValue().Set(v8::String::NewFromUtf8Literal(isolate,
      "BlockDevice capability: read(offset, length), "
      "write(offset, data), size(), sync()"));
}

// __openBlockDevice(path) → capability object
static void OpenBlockDevice(
    const v8::FunctionCallbackInfo<v8::Value>& info) {
  v8::Isolate* isolate = info.GetIsolate();
  v8::HandleScope handle_scope(isolate);

  if (info.Length() < 1 || !info[0]->IsString()) {
    isolate->ThrowException(v8::Exception::TypeError(
        v8::String::NewFromUtf8Literal(isolate,
            "__openBlockDevice(path): path must be a string")));
    return;
  }

  v8::String::Utf8Value path(isolate, info[0]);
  int fd = open(*path, O_RDWR);
  if (fd < 0) {
    char msg[256];
    snprintf(msg, sizeof(msg), "Failed to open block device: %s", *path);
    isolate->ThrowException(v8::Exception::Error(
        v8::String::NewFromUtf8(isolate, msg,
                                v8::NewStringType::kNormal)
            .ToLocalChecked()));
    return;
  }

  fprintf(stdout, "endo-init: Opened block device %s (fd=%d)\n", *path, fd);

  // Create the capability object template.
  v8::Local<v8::ObjectTemplate> tmpl = v8::ObjectTemplate::New(isolate);
  tmpl->SetInternalFieldCount(kBlockDeviceInternalFieldCount);

  auto Set = [&](const char* name, v8::FunctionCallback cb) {
    tmpl->Set(v8::String::NewFromUtf8(isolate, name,
                                      v8::NewStringType::kNormal)
                  .ToLocalChecked(),
              v8::FunctionTemplate::New(isolate, cb));
  };

  Set("read", BlockRead);
  Set("write", BlockWrite);
  Set("size", BlockSize);
  Set("sync", BlockSync);
  Set("help", BlockHelp);

  // Instantiate and store the fd.
  v8::Local<v8::Object> obj =
      tmpl->NewInstance(isolate->GetCurrentContext()).ToLocalChecked();
  obj->SetInternalField(0,
      v8::External::New(isolate, reinterpret_cast<void*>(
          static_cast<intptr_t>(fd))));

  info.GetReturnValue().Set(obj);
}

void InstallBlockDevice(v8::Isolate* isolate,
                        v8::Local<v8::ObjectTemplate> global) {
  global->Set(
      v8::String::NewFromUtf8Literal(isolate, "__openBlockDevice"),
      v8::FunctionTemplate::New(isolate, OpenBlockDevice));
}

}  // namespace devices
}  // namespace endo
