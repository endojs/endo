// Microphone (ALSA) Capability Binding
//
// Exposes an ALSA audio capture device as a streaming capability.
// Audio flows as Uint8Array chunks of PCM data.
//
// Like the camera, a microphone capability can be passed across
// chat — the recipient gets a live audio stream.  Revoke the
// capability reference and audio stops flowing.
//
// Uses the ALSA userspace API directly (no PulseAudio).
// On the minimal Endo OS kernel, ALSA is the only audio layer.
//
// JS API:
//   const mic = __openMicrophone('hw:0,0');
//   mic.sampleRate();             // → number (e.g., 44100)
//   mic.channels();               // → number (e.g., 1 or 2)
//   mic.bitsPerSample();          // → number (e.g., 16)
//   const chunk = mic.read(frames); // → Uint8Array (PCM data)
//   mic.start();
//   mic.stop();
//   mic.close();
//   mic.help();
//
// Note: This binding uses raw ALSA ioctls via /dev/snd/pcmC*D*c
// rather than libasound, keeping the binary dependency-free.
// For Phase 0, we provide a simplified implementation using
// the OSS-compatible /dev/dsp interface or direct ALSA.

#include "devices.h"

#include <cstdio>
#include <cstring>
#include <cerrno>
#include <fcntl.h>
#include <unistd.h>
#include <sys/ioctl.h>
#include <linux/soundcard.h>

namespace endo {
namespace devices {

struct MicrophoneState {
  int fd;
  uint32_t sample_rate;
  uint32_t channels;
  uint32_t bits_per_sample;
  bool started;
};

static MicrophoneState* GetMicState(
    const v8::FunctionCallbackInfo<v8::Value>& info) {
  v8::Local<v8::External> wrap =
      v8::Local<v8::External>::Cast(info.This()->GetInternalField(0));
  return static_cast<MicrophoneState*>(wrap->Value());
}

static void MicSampleRate(
    const v8::FunctionCallbackInfo<v8::Value>& info) {
  info.GetReturnValue().Set(
      static_cast<double>(GetMicState(info)->sample_rate));
}

static void MicChannels(
    const v8::FunctionCallbackInfo<v8::Value>& info) {
  info.GetReturnValue().Set(
      static_cast<double>(GetMicState(info)->channels));
}

static void MicBitsPerSample(
    const v8::FunctionCallbackInfo<v8::Value>& info) {
  info.GetReturnValue().Set(
      static_cast<double>(GetMicState(info)->bits_per_sample));
}

// mic.read(frames) → Uint8Array (PCM data)
static void MicRead(const v8::FunctionCallbackInfo<v8::Value>& info) {
  v8::Isolate* isolate = info.GetIsolate();
  v8::HandleScope handle_scope(isolate);
  MicrophoneState* state = GetMicState(info);

  uint32_t frames = 1024;
  if (info.Length() >= 1 && info[0]->IsNumber()) {
    frames = info[0]->Uint32Value(isolate->GetCurrentContext())
                 .FromMaybe(1024);
  }

  // Calculate byte size: frames * channels * (bits/8).
  size_t frame_size =
      state->channels * (state->bits_per_sample / 8);
  size_t byte_count = frames * frame_size;

  if (byte_count > 4 * 1024 * 1024) {
    isolate->ThrowException(v8::Exception::RangeError(
        v8::String::NewFromUtf8Literal(isolate,
            "read size too large (max 4MB)")));
    return;
  }

  std::unique_ptr<v8::BackingStore> backing =
      v8::ArrayBuffer::NewBackingStore(isolate, byte_count);

  ssize_t n = read(state->fd, backing->Data(), byte_count);
  if (n < 0) {
    if (errno == EAGAIN) {
      v8::Local<v8::ArrayBuffer> buf =
          v8::ArrayBuffer::New(isolate, 0);
      info.GetReturnValue().Set(v8::Uint8Array::New(buf, 0, 0));
      return;
    }
    isolate->ThrowException(v8::Exception::Error(
        v8::String::NewFromUtf8Literal(isolate,
            "microphone read failed")));
    return;
  }

  v8::Local<v8::ArrayBuffer> ab =
      v8::ArrayBuffer::New(isolate, std::move(backing));
  info.GetReturnValue().Set(
      v8::Uint8Array::New(ab, 0, static_cast<size_t>(n)));
}

static void MicStart(const v8::FunctionCallbackInfo<v8::Value>& info) {
  MicrophoneState* state = GetMicState(info);
  // For OSS, reading implicitly starts capture.
  state->started = true;
  fprintf(stdout, "endo-init: Microphone capture started\n");
}

static void MicStop(const v8::FunctionCallbackInfo<v8::Value>& info) {
  MicrophoneState* state = GetMicState(info);
  // Reset the device to stop capture.
  ioctl(state->fd, SNDCTL_DSP_RESET, 0);
  state->started = false;
  fprintf(stdout, "endo-init: Microphone capture stopped\n");
}

static void MicClose(const v8::FunctionCallbackInfo<v8::Value>& info) {
  MicrophoneState* state = GetMicState(info);
  if (state->fd >= 0) {
    close(state->fd);
    state->fd = -1;
  }
}

static void MicHelp(const v8::FunctionCallbackInfo<v8::Value>& info) {
  info.GetReturnValue().Set(v8::String::NewFromUtf8Literal(
      info.GetIsolate(),
      "Microphone capability: sampleRate(), channels(), "
      "bitsPerSample(), read(frames), start(), stop(), close()"));
}

// __openMicrophone(device) → Microphone capability
//
// device: ALSA device string like 'hw:0,0' or OSS path like
//         '/dev/dsp'.  Defaults to '/dev/dsp' for simplicity.
static void OpenMicrophone(
    const v8::FunctionCallbackInfo<v8::Value>& info) {
  v8::Isolate* isolate = info.GetIsolate();
  v8::HandleScope handle_scope(isolate);

  const char* path = "/dev/dsp";
  v8::String::Utf8Value custom_path(isolate, info[0]);
  if (info.Length() >= 1 && info[0]->IsString()) {
    path = *custom_path;
  }

  int fd = open(path, O_RDONLY);
  if (fd < 0) {
    char msg[256];
    snprintf(msg, sizeof(msg), "Failed to open microphone: %s", path);
    isolate->ThrowException(v8::Exception::Error(
        v8::String::NewFromUtf8(isolate, msg,
                                v8::NewStringType::kNormal)
            .ToLocalChecked()));
    return;
  }

  // Configure audio format via OSS ioctls.
  int format = AFMT_S16_LE;
  ioctl(fd, SNDCTL_DSP_SETFMT, &format);

  int channels = 1; // mono
  ioctl(fd, SNDCTL_DSP_CHANNELS, &channels);

  int sample_rate = 44100;
  ioctl(fd, SNDCTL_DSP_SPEED, &sample_rate);

  auto* state = new MicrophoneState{
    fd,
    static_cast<uint32_t>(sample_rate),
    static_cast<uint32_t>(channels),
    16, // S16_LE = 16 bits
    false
  };

  fprintf(stdout,
      "endo-init: Microphone %s: %uHz %uch %ubit\n",
      path, state->sample_rate, state->channels,
      state->bits_per_sample);

  // Build capability object.
  v8::Local<v8::ObjectTemplate> tmpl = v8::ObjectTemplate::New(isolate);
  tmpl->SetInternalFieldCount(1);

  auto Set = [&](const char* name, v8::FunctionCallback cb) {
    tmpl->Set(v8::String::NewFromUtf8(isolate, name,
                                      v8::NewStringType::kNormal)
                  .ToLocalChecked(),
              v8::FunctionTemplate::New(isolate, cb));
  };

  Set("sampleRate", MicSampleRate);
  Set("channels", MicChannels);
  Set("bitsPerSample", MicBitsPerSample);
  Set("read", MicRead);
  Set("start", MicStart);
  Set("stop", MicStop);
  Set("close", MicClose);
  Set("help", MicHelp);

  v8::Local<v8::Object> obj =
      tmpl->NewInstance(isolate->GetCurrentContext()).ToLocalChecked();
  obj->SetInternalField(0, v8::External::New(isolate, state));

  info.GetReturnValue().Set(obj);
}

void InstallMicrophone(v8::Isolate* isolate,
                       v8::Local<v8::ObjectTemplate> global) {
  global->Set(
      v8::String::NewFromUtf8Literal(isolate, "__openMicrophone"),
      v8::FunctionTemplate::New(isolate, OpenMicrophone));
}

}  // namespace devices
}  // namespace endo
