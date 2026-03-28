// Device Capability Wrappers
//
// Wraps raw deno_core ops into hardened capability objects.
// Each device is opened by calling an op that returns a resource ID,
// then methods are closures over that ID calling further ops.
//
// The capability discipline:
//   1. Ops are low-level (take resource IDs, return buffers)
//   2. This layer wraps them into objects with methods
//   3. harden() freezes each object — it becomes a capability
//   4. Only code that receives a reference can use the device
//
// These wrappers are loaded BEFORE bootstrap.js, which uses them
// to probe hardware and assemble hostPowers.

((globalThis) => {
  'use strict';

  const ops = Deno.core.ops;

  // --- Block Device ---

  globalThis.__openBlockDevice = function openBlockDevice(path) {
    const rid = ops.op_open_block_device(path);
    return harden({
      read(offset, length) {
        return ops.op_block_read(rid, offset, length);
      },
      write(offset, data) {
        ops.op_block_write(rid, offset, data);
      },
      size() {
        return ops.op_block_size(rid);
      },
      sync() {
        ops.op_block_sync(rid);
      },
      help() {
        return 'BlockDevice capability: read(offset, length), ' +
               'write(offset, data), size(), sync()';
      },
    });
  };

  // --- Network ---

  function makeConnection(rid) {
    return harden({
      read(maxBytes) {
        return ops.op_net_read(rid, maxBytes || 4096);
      },
      write(data) {
        return ops.op_net_write(rid, data);
      },
      close() {
        ops.op_net_close(rid);
      },
      remoteAddress() {
        return ops.op_net_remote_addr(rid);
      },
      help() {
        return 'Connection capability: read(maxBytes), write(data), ' +
               'close(), remoteAddress()';
      },
    });
  }

  function makeListener(rid) {
    return harden({
      accept() {
        const connRid = ops.op_net_accept(rid);
        return makeConnection(connRid);
      },
      port() {
        return ops.op_net_local_port(rid);
      },
      close() {
        ops.op_net_close(rid);
      },
      help() {
        return 'Listener capability: accept(), port(), close()';
      },
    });
  }

  globalThis.__createNetworkInterface = function createNetworkInterface() {
    return harden({
      listen(port) {
        const rid = ops.op_net_listen(port || 0);
        return makeListener(rid);
      },
      connect(host, port) {
        const rid = ops.op_net_connect(host, port);
        return makeConnection(rid);
      },
      help() {
        return 'NetworkInterface capability: listen(port), ' +
               'connect(host, port)';
      },
    });
  };

  // --- Framebuffer ---

  globalThis.__openFramebuffer = function openFramebuffer(path) {
    const rid = ops.op_open_framebuffer(path || '/dev/fb0');
    const info = ops.op_fb_info(rid);

    return harden({
      width() { return info.width; },
      height() { return info.height; },
      bpp() { return info.bpp; },
      writeRegion(x, y, w, h, data) {
        ops.op_fb_write_region(rid, x, y, w, h, data);
      },
      fillRect(x, y, w, h, r, g, b) {
        ops.op_fb_fill_rect(rid, x, y, w, h, r, g, b);
      },
      flip() {
        ops.op_fb_sync(rid);
      },
      help() {
        return 'Framebuffer capability: width(), height(), bpp(), ' +
               'writeRegion(x,y,w,h,data), fillRect(x,y,w,h,r,g,b), flip()';
      },
    });
  };

  // --- Camera ---

  globalThis.__openCamera = function openCamera(path) {
    const rid = ops.op_open_camera(path || '/dev/video0');
    const info = ops.op_camera_info(rid);

    return harden({
      width() { return info.width; },
      height() { return info.height; },
      format() { return info.format; },
      startStreaming() {
        ops.op_camera_start(rid);
      },
      capture() {
        return ops.op_camera_capture(rid);
      },
      stopStreaming() {
        ops.op_camera_stop(rid);
      },
      close() {
        ops.op_camera_close(rid);
      },
      help() {
        return 'Camera capability: width(), height(), format(), ' +
               'capture(), startStreaming(), stopStreaming(), close()';
      },
    });
  };

  // --- Microphone ---

  globalThis.__openMicrophone = function openMicrophone(device) {
    const rid = ops.op_open_microphone(device || '/dev/dsp');
    const info = ops.op_mic_info(rid);

    return harden({
      sampleRate() { return info.sample_rate; },
      channels() { return info.channels; },
      bitsPerSample() { return info.bits_per_sample; },
      read(frames) {
        return ops.op_mic_read(rid, frames || 1024);
      },
      close() {
        ops.op_mic_close(rid);
      },
      help() {
        return 'Microphone capability: sampleRate(), channels(), ' +
               'bitsPerSample(), read(frames), close()';
      },
    });
  };

})(globalThis);
