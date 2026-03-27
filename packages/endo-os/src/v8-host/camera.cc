// Camera (V4L2) Capability Binding
//
// Exposes a Video4Linux2 camera as a video frame stream capability.
// Each call to capture() returns a single frame as a Uint8Array.
//
// In the Endo capability model, you could pass a camera capability
// across chat — the recipient gets live video frames without
// needing any OS-level permission grant.  Revoke the capability
// and the stream stops.
//
// JS API:
//   const cam = __openCamera('/dev/video0');
//   cam.width();                  // → number
//   cam.height();                 // → number
//   cam.format();                 // → string (e.g., 'YUYV', 'MJPG')
//   const frame = cam.capture();  // → Uint8Array (one frame)
//   cam.startStreaming();         // begin continuous capture
//   cam.stopStreaming();          // stop capture
//   cam.close();
//   cam.help();

#include "devices.h"

#include <cstdio>
#include <cstring>
#include <cerrno>
#include <fcntl.h>
#include <unistd.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <linux/videodev2.h>

namespace endo {
namespace devices {

// Number of mmap'd frame buffers for streaming.
static const int kNumBuffers = 4;

struct CameraBuffer {
  void* start;
  size_t length;
};

struct CameraState {
  int fd;
  uint32_t width;
  uint32_t height;
  uint32_t pixfmt;           // V4L2 fourcc
  CameraBuffer buffers[kNumBuffers];
  int buffer_count;
  bool streaming;
};

static CameraState* GetCamState(
    const v8::FunctionCallbackInfo<v8::Value>& info) {
  v8::Local<v8::External> wrap =
      v8::Local<v8::External>::Cast(info.This()->GetInternalField(0));
  return static_cast<CameraState*>(wrap->Value());
}

// Convert V4L2 fourcc to a readable string.
static void FourccToStr(uint32_t fourcc, char out[5]) {
  out[0] = static_cast<char>(fourcc & 0xFF);
  out[1] = static_cast<char>((fourcc >> 8) & 0xFF);
  out[2] = static_cast<char>((fourcc >> 16) & 0xFF);
  out[3] = static_cast<char>((fourcc >> 24) & 0xFF);
  out[4] = '\0';
}

static void CamWidth(const v8::FunctionCallbackInfo<v8::Value>& info) {
  info.GetReturnValue().Set(
      static_cast<double>(GetCamState(info)->width));
}

static void CamHeight(const v8::FunctionCallbackInfo<v8::Value>& info) {
  info.GetReturnValue().Set(
      static_cast<double>(GetCamState(info)->height));
}

static void CamFormat(const v8::FunctionCallbackInfo<v8::Value>& info) {
  v8::Isolate* isolate = info.GetIsolate();
  char fmt[5];
  FourccToStr(GetCamState(info)->pixfmt, fmt);
  info.GetReturnValue().Set(
      v8::String::NewFromUtf8(isolate, fmt, v8::NewStringType::kNormal)
          .ToLocalChecked());
}

// Start V4L2 streaming (queues buffers, activates VIDIOC_STREAMON).
static void CamStartStreaming(
    const v8::FunctionCallbackInfo<v8::Value>& info) {
  v8::Isolate* isolate = info.GetIsolate();
  CameraState* state = GetCamState(info);

  if (state->streaming) return;

  // Request buffers.
  struct v4l2_requestbuffers req;
  memset(&req, 0, sizeof(req));
  req.count = kNumBuffers;
  req.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
  req.memory = V4L2_MEMORY_MMAP;

  if (ioctl(state->fd, VIDIOC_REQBUFS, &req) < 0) {
    isolate->ThrowException(v8::Exception::Error(
        v8::String::NewFromUtf8Literal(isolate,
            "VIDIOC_REQBUFS failed")));
    return;
  }

  state->buffer_count = static_cast<int>(req.count);

  // Map each buffer.
  for (int i = 0; i < state->buffer_count; i++) {
    struct v4l2_buffer buf;
    memset(&buf, 0, sizeof(buf));
    buf.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    buf.memory = V4L2_MEMORY_MMAP;
    buf.index = static_cast<uint32_t>(i);

    if (ioctl(state->fd, VIDIOC_QUERYBUF, &buf) < 0) continue;

    state->buffers[i].length = buf.length;
    state->buffers[i].start = mmap(
        nullptr, buf.length, PROT_READ | PROT_WRITE,
        MAP_SHARED, state->fd, buf.m.offset);
  }

  // Queue all buffers.
  for (int i = 0; i < state->buffer_count; i++) {
    struct v4l2_buffer buf;
    memset(&buf, 0, sizeof(buf));
    buf.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    buf.memory = V4L2_MEMORY_MMAP;
    buf.index = static_cast<uint32_t>(i);
    ioctl(state->fd, VIDIOC_QBUF, &buf);
  }

  // Start streaming.
  enum v4l2_buf_type type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
  if (ioctl(state->fd, VIDIOC_STREAMON, &type) < 0) {
    isolate->ThrowException(v8::Exception::Error(
        v8::String::NewFromUtf8Literal(isolate,
            "VIDIOC_STREAMON failed")));
    return;
  }

  state->streaming = true;
  fprintf(stdout, "endo-init: Camera streaming started\n");
}

static void CamStopStreaming(
    const v8::FunctionCallbackInfo<v8::Value>& info) {
  CameraState* state = GetCamState(info);
  if (!state->streaming) return;

  enum v4l2_buf_type type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
  ioctl(state->fd, VIDIOC_STREAMOFF, &type);

  // Unmap buffers.
  for (int i = 0; i < state->buffer_count; i++) {
    if (state->buffers[i].start && state->buffers[i].start != MAP_FAILED) {
      munmap(state->buffers[i].start, state->buffers[i].length);
    }
  }

  state->streaming = false;
  fprintf(stdout, "endo-init: Camera streaming stopped\n");
}

// cam.capture() → Uint8Array (one frame)
static void CamCapture(const v8::FunctionCallbackInfo<v8::Value>& info) {
  v8::Isolate* isolate = info.GetIsolate();
  v8::HandleScope handle_scope(isolate);
  CameraState* state = GetCamState(info);

  if (!state->streaming) {
    // Auto-start streaming on first capture.
    CamStartStreaming(info);
    if (!state->streaming) return; // start failed
  }

  // Dequeue a filled buffer.
  struct v4l2_buffer buf;
  memset(&buf, 0, sizeof(buf));
  buf.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
  buf.memory = V4L2_MEMORY_MMAP;

  if (ioctl(state->fd, VIDIOC_DQBUF, &buf) < 0) {
    isolate->ThrowException(v8::Exception::Error(
        v8::String::NewFromUtf8Literal(isolate,
            "Failed to dequeue camera frame")));
    return;
  }

  // Copy frame data into a new JS ArrayBuffer.
  size_t frame_size = buf.bytesused;
  std::unique_ptr<v8::BackingStore> backing =
      v8::ArrayBuffer::NewBackingStore(isolate, frame_size);
  memcpy(backing->Data(), state->buffers[buf.index].start, frame_size);

  // Re-queue the buffer for the next frame.
  ioctl(state->fd, VIDIOC_QBUF, &buf);

  v8::Local<v8::ArrayBuffer> ab =
      v8::ArrayBuffer::New(isolate, std::move(backing));
  info.GetReturnValue().Set(
      v8::Uint8Array::New(ab, 0, frame_size));
}

static void CamClose(const v8::FunctionCallbackInfo<v8::Value>& info) {
  CameraState* state = GetCamState(info);
  if (state->streaming) {
    CamStopStreaming(info);
  }
  close(state->fd);
  state->fd = -1;
}

static void CamHelp(const v8::FunctionCallbackInfo<v8::Value>& info) {
  info.GetReturnValue().Set(v8::String::NewFromUtf8Literal(
      info.GetIsolate(),
      "Camera capability: width(), height(), format(), capture(), "
      "startStreaming(), stopStreaming(), close()"));
}

// __openCamera(path) → Camera capability
static void OpenCamera(const v8::FunctionCallbackInfo<v8::Value>& info) {
  v8::Isolate* isolate = info.GetIsolate();
  v8::HandleScope handle_scope(isolate);

  const char* path = "/dev/video0";
  v8::String::Utf8Value custom_path(isolate, info[0]);
  if (info.Length() >= 1 && info[0]->IsString()) {
    path = *custom_path;
  }

  int fd = open(path, O_RDWR);
  if (fd < 0) {
    char msg[256];
    snprintf(msg, sizeof(msg), "Failed to open camera: %s", path);
    isolate->ThrowException(v8::Exception::Error(
        v8::String::NewFromUtf8(isolate, msg,
                                v8::NewStringType::kNormal)
            .ToLocalChecked()));
    return;
  }

  // Query capabilities.
  struct v4l2_capability cap;
  if (ioctl(fd, VIDIOC_QUERYCAP, &cap) < 0 ||
      !(cap.capabilities & V4L2_CAP_VIDEO_CAPTURE)) {
    close(fd);
    isolate->ThrowException(v8::Exception::Error(
        v8::String::NewFromUtf8Literal(isolate,
            "Device is not a video capture device")));
    return;
  }

  // Set format (try MJPEG first, fall back to YUYV).
  struct v4l2_format fmt;
  memset(&fmt, 0, sizeof(fmt));
  fmt.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
  fmt.fmt.pix.width = 640;
  fmt.fmt.pix.height = 480;
  fmt.fmt.pix.pixelformat = V4L2_PIX_FMT_MJPEG;
  fmt.fmt.pix.field = V4L2_FIELD_NONE;

  if (ioctl(fd, VIDIOC_S_FMT, &fmt) < 0) {
    // Fall back to YUYV.
    fmt.fmt.pix.pixelformat = V4L2_PIX_FMT_YUYV;
    ioctl(fd, VIDIOC_S_FMT, &fmt);
  }

  // Read back actual format.
  ioctl(fd, VIDIOC_G_FMT, &fmt);

  auto* state = new CameraState{
    fd,
    fmt.fmt.pix.width, fmt.fmt.pix.height,
    fmt.fmt.pix.pixelformat,
    {}, 0, false
  };

  char fourcc[5];
  FourccToStr(state->pixfmt, fourcc);
  fprintf(stdout,
      "endo-init: Camera %s: %ux%u %s\n",
      path, state->width, state->height, fourcc);

  // Build capability object.
  v8::Local<v8::ObjectTemplate> tmpl = v8::ObjectTemplate::New(isolate);
  tmpl->SetInternalFieldCount(1);

  auto Set = [&](const char* name, v8::FunctionCallback cb) {
    tmpl->Set(v8::String::NewFromUtf8(isolate, name,
                                      v8::NewStringType::kNormal)
                  .ToLocalChecked(),
              v8::FunctionTemplate::New(isolate, cb));
  };

  Set("width", CamWidth);
  Set("height", CamHeight);
  Set("format", CamFormat);
  Set("capture", CamCapture);
  Set("startStreaming", CamStartStreaming);
  Set("stopStreaming", CamStopStreaming);
  Set("close", CamClose);
  Set("help", CamHelp);

  v8::Local<v8::Object> obj =
      tmpl->NewInstance(isolate->GetCurrentContext()).ToLocalChecked();
  obj->SetInternalField(0, v8::External::New(isolate, state));

  info.GetReturnValue().Set(obj);
}

void InstallCamera(v8::Isolate* isolate,
                   v8::Local<v8::ObjectTemplate> global) {
  global->Set(
      v8::String::NewFromUtf8Literal(isolate, "__openCamera"),
      v8::FunctionTemplate::New(isolate, OpenCamera));
}

}  // namespace devices
}  // namespace endo
