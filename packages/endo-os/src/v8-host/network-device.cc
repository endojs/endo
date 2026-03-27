// Network Capability Binding
//
// Exposes TCP networking as JavaScript capability objects via Linux
// sockets.  Instead of a global socket API, you get a
// NetworkInterface capability with listen() and connect() methods
// that return Connection capabilities.
//
// Each Connection is a bidirectional byte stream — but in the Endo
// model, these become CapTP transports.  The stream handoff use
// case (pass a stream across chat to a third party) works because
// connections are capabilities: transferable references.
//
// JS API:
//   const net = __createNetworkInterface();
//   const server = net.listen(port);           // → Listener
//   const conn = server.accept();              // → Connection
//   const conn2 = net.connect(host, port);     // → Connection
//   const data = conn.read(maxBytes);          // → Uint8Array
//   conn.write(uint8array);                    // → undefined
//   conn.close();
//   conn.help();

#include "devices.h"

#include <cstdio>
#include <cstring>
#include <cerrno>
#include <unistd.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <arpa/inet.h>
#include <netdb.h>
#include <fcntl.h>

namespace endo {
namespace devices {

// --- Connection capability ---

static int GetSocketFd(const v8::FunctionCallbackInfo<v8::Value>& info) {
  v8::Local<v8::Object> self = info.This();
  v8::Local<v8::External> wrap =
      v8::Local<v8::External>::Cast(self->GetInternalField(0));
  return static_cast<int>(reinterpret_cast<intptr_t>(wrap->Value()));
}

// conn.read(maxBytes) ��� Uint8Array
static void ConnRead(const v8::FunctionCallbackInfo<v8::Value>& info) {
  v8::Isolate* isolate = info.GetIsolate();
  v8::HandleScope handle_scope(isolate);

  int fd = GetSocketFd(info);
  size_t max_bytes = 4096;
  if (info.Length() >= 1 && info[0]->IsNumber()) {
    max_bytes = static_cast<size_t>(
        info[0]->IntegerValue(isolate->GetCurrentContext()).FromMaybe(4096));
  }

  if (max_bytes > 16 * 1024 * 1024) max_bytes = 16 * 1024 * 1024;

  std::unique_ptr<v8::BackingStore> backing =
      v8::ArrayBuffer::NewBackingStore(isolate, max_bytes);

  ssize_t n = recv(fd, backing->Data(), max_bytes, 0);
  if (n < 0) {
    if (errno == EAGAIN || errno == EWOULDBLOCK) {
      // Return empty array for non-blocking "no data yet".
      v8::Local<v8::ArrayBuffer> buf =
          v8::ArrayBuffer::New(isolate, 0);
      info.GetReturnValue().Set(v8::Uint8Array::New(buf, 0, 0));
      return;
    }
    isolate->ThrowException(v8::Exception::Error(
        v8::String::NewFromUtf8Literal(isolate, "connection read failed")));
    return;
  }

  v8::Local<v8::ArrayBuffer> buffer =
      v8::ArrayBuffer::New(isolate, std::move(backing));
  info.GetReturnValue().Set(
      v8::Uint8Array::New(buffer, 0, static_cast<size_t>(n)));
}

// conn.write(data) → number (bytes written)
static void ConnWrite(const v8::FunctionCallbackInfo<v8::Value>& info) {
  v8::Isolate* isolate = info.GetIsolate();
  v8::HandleScope handle_scope(isolate);

  if (info.Length() < 1 || !info[0]->IsTypedArray()) {
    isolate->ThrowException(v8::Exception::TypeError(
        v8::String::NewFromUtf8Literal(isolate,
            "write(data): data must be a TypedArray")));
    return;
  }

  int fd = GetSocketFd(info);
  v8::Local<v8::TypedArray> typed = v8::Local<v8::TypedArray>::Cast(info[0]);
  size_t len = typed->ByteLength();
  size_t off = typed->ByteOffset();
  const uint8_t* data =
      static_cast<const uint8_t*>(
          typed->Buffer()->GetBackingStore()->Data()) + off;

  ssize_t n = send(fd, data, len, MSG_NOSIGNAL);
  if (n < 0) {
    isolate->ThrowException(v8::Exception::Error(
        v8::String::NewFromUtf8Literal(isolate, "connection write failed")));
    return;
  }

  info.GetReturnValue().Set(
      v8::Number::New(isolate, static_cast<double>(n)));
}

// conn.close()
static void ConnClose(const v8::FunctionCallbackInfo<v8::Value>& info) {
  int fd = GetSocketFd(info);
  close(fd);
}

// conn.remoteAddress() → string
static void ConnRemoteAddress(
    const v8::FunctionCallbackInfo<v8::Value>& info) {
  v8::Isolate* isolate = info.GetIsolate();
  int fd = GetSocketFd(info);

  struct sockaddr_in addr;
  socklen_t addr_len = sizeof(addr);
  if (getpeername(fd, reinterpret_cast<struct sockaddr*>(&addr),
                  &addr_len) == 0) {
    char buf[INET_ADDRSTRLEN + 8];
    snprintf(buf, sizeof(buf), "%s:%d",
             inet_ntoa(addr.sin_addr), ntohs(addr.sin_port));
    info.GetReturnValue().Set(
        v8::String::NewFromUtf8(isolate, buf,
                                v8::NewStringType::kNormal)
            .ToLocalChecked());
  } else {
    info.GetReturnValue().Set(
        v8::String::NewFromUtf8Literal(isolate, "<unknown>"));
  }
}

// conn.help()
static void ConnHelp(const v8::FunctionCallbackInfo<v8::Value>& info) {
  info.GetReturnValue().Set(v8::String::NewFromUtf8Literal(
      info.GetIsolate(),
      "Connection capability: read(maxBytes), write(data), "
      "close(), remoteAddress()"));
}

// Create a Connection capability object wrapping a socket fd.
static v8::Local<v8::Object> MakeConnection(v8::Isolate* isolate, int fd) {
  v8::EscapableHandleScope handle_scope(isolate);

  v8::Local<v8::ObjectTemplate> tmpl = v8::ObjectTemplate::New(isolate);
  tmpl->SetInternalFieldCount(1);

  auto Set = [&](const char* name, v8::FunctionCallback cb) {
    tmpl->Set(v8::String::NewFromUtf8(isolate, name,
                                      v8::NewStringType::kNormal)
                  .ToLocalChecked(),
              v8::FunctionTemplate::New(isolate, cb));
  };

  Set("read", ConnRead);
  Set("write", ConnWrite);
  Set("close", ConnClose);
  Set("remoteAddress", ConnRemoteAddress);
  Set("help", ConnHelp);

  v8::Local<v8::Object> obj =
      tmpl->NewInstance(isolate->GetCurrentContext()).ToLocalChecked();
  obj->SetInternalField(0,
      v8::External::New(isolate, reinterpret_cast<void*>(
          static_cast<intptr_t>(fd))));

  return handle_scope.Escape(obj);
}

// --- Listener capability ---

// listener.accept() → Connection
static void ListenerAccept(
    const v8::FunctionCallbackInfo<v8::Value>& info) {
  v8::Isolate* isolate = info.GetIsolate();
  v8::HandleScope handle_scope(isolate);

  int listen_fd = GetSocketFd(info);

  struct sockaddr_in client_addr;
  socklen_t addr_len = sizeof(client_addr);
  int client_fd = accept(listen_fd,
      reinterpret_cast<struct sockaddr*>(&client_addr), &addr_len);

  if (client_fd < 0) {
    isolate->ThrowException(v8::Exception::Error(
        v8::String::NewFromUtf8Literal(isolate, "accept() failed")));
    return;
  }

  // Disable Nagle for low-latency CapTP messages.
  int flag = 1;
  setsockopt(client_fd, IPPROTO_TCP, TCP_NODELAY, &flag, sizeof(flag));

  fprintf(stdout, "endo-init: Accepted connection from %s:%d\n",
          inet_ntoa(client_addr.sin_addr), ntohs(client_addr.sin_port));

  info.GetReturnValue().Set(MakeConnection(isolate, client_fd));
}

// listener.close()
static void ListenerClose(
    const v8::FunctionCallbackInfo<v8::Value>& info) {
  int fd = GetSocketFd(info);
  close(fd);
}

// listener.port() → number
static void ListenerPort(
    const v8::FunctionCallbackInfo<v8::Value>& info) {
  v8::Isolate* isolate = info.GetIsolate();
  int fd = GetSocketFd(info);

  struct sockaddr_in addr;
  socklen_t addr_len = sizeof(addr);
  getsockname(fd, reinterpret_cast<struct sockaddr*>(&addr), &addr_len);

  info.GetReturnValue().Set(
      v8::Number::New(isolate, static_cast<double>(ntohs(addr.sin_port))));
}

// listener.help()
static void ListenerHelp(
    const v8::FunctionCallbackInfo<v8::Value>& info) {
  info.GetReturnValue().Set(v8::String::NewFromUtf8Literal(
      info.GetIsolate(),
      "Listener capability: accept(), close(), port()"));
}

// --- Network interface capability ---

// net.listen(port) → Listener
static void NetListen(const v8::FunctionCallbackInfo<v8::Value>& info) {
  v8::Isolate* isolate = info.GetIsolate();
  v8::HandleScope handle_scope(isolate);

  int port = 0;
  if (info.Length() >= 1 && info[0]->IsNumber()) {
    port = static_cast<int>(
        info[0]->IntegerValue(isolate->GetCurrentContext()).FromMaybe(0));
  }

  int fd = socket(AF_INET, SOCK_STREAM, 0);
  if (fd < 0) {
    isolate->ThrowException(v8::Exception::Error(
        v8::String::NewFromUtf8Literal(isolate, "socket() failed")));
    return;
  }

  int reuse = 1;
  setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &reuse, sizeof(reuse));

  struct sockaddr_in addr;
  memset(&addr, 0, sizeof(addr));
  addr.sin_family = AF_INET;
  addr.sin_addr.s_addr = INADDR_ANY;
  addr.sin_port = htons(static_cast<uint16_t>(port));

  if (bind(fd, reinterpret_cast<struct sockaddr*>(&addr),
           sizeof(addr)) < 0) {
    close(fd);
    isolate->ThrowException(v8::Exception::Error(
        v8::String::NewFromUtf8Literal(isolate, "bind() failed")));
    return;
  }

  if (listen(fd, 128) < 0) {
    close(fd);
    isolate->ThrowException(v8::Exception::Error(
        v8::String::NewFromUtf8Literal(isolate, "listen() failed")));
    return;
  }

  // Read back the actual port (useful when port=0).
  socklen_t addr_len = sizeof(addr);
  getsockname(fd, reinterpret_cast<struct sockaddr*>(&addr), &addr_len);
  fprintf(stdout, "endo-init: Listening on port %d\n", ntohs(addr.sin_port));

  // Build Listener capability.
  v8::Local<v8::ObjectTemplate> tmpl = v8::ObjectTemplate::New(isolate);
  tmpl->SetInternalFieldCount(1);

  auto Set = [&](const char* name, v8::FunctionCallback cb) {
    tmpl->Set(v8::String::NewFromUtf8(isolate, name,
                                      v8::NewStringType::kNormal)
                  .ToLocalChecked(),
              v8::FunctionTemplate::New(isolate, cb));
  };

  Set("accept", ListenerAccept);
  Set("close", ListenerClose);
  Set("port", ListenerPort);
  Set("help", ListenerHelp);

  v8::Local<v8::Object> obj =
      tmpl->NewInstance(isolate->GetCurrentContext()).ToLocalChecked();
  obj->SetInternalField(0,
      v8::External::New(isolate, reinterpret_cast<void*>(
          static_cast<intptr_t>(fd))));

  info.GetReturnValue().Set(obj);
}

// net.connect(host, port) → Connection
static void NetConnect(const v8::FunctionCallbackInfo<v8::Value>& info) {
  v8::Isolate* isolate = info.GetIsolate();
  v8::HandleScope handle_scope(isolate);

  if (info.Length() < 2 || !info[0]->IsString() || !info[1]->IsNumber()) {
    isolate->ThrowException(v8::Exception::TypeError(
        v8::String::NewFromUtf8Literal(isolate,
            "connect(host, port): host must be string, port number")));
    return;
  }

  v8::String::Utf8Value host(isolate, info[0]);
  int port = static_cast<int>(
      info[1]->IntegerValue(isolate->GetCurrentContext()).FromMaybe(0));

  struct addrinfo hints, *result;
  memset(&hints, 0, sizeof(hints));
  hints.ai_family = AF_INET;
  hints.ai_socktype = SOCK_STREAM;

  char port_str[8];
  snprintf(port_str, sizeof(port_str), "%d", port);

  int err = getaddrinfo(*host, port_str, &hints, &result);
  if (err != 0) {
    isolate->ThrowException(v8::Exception::Error(
        v8::String::NewFromUtf8Literal(isolate, "DNS resolution failed")));
    return;
  }

  int fd = socket(result->ai_family, result->ai_socktype,
                  result->ai_protocol);
  if (fd < 0) {
    freeaddrinfo(result);
    isolate->ThrowException(v8::Exception::Error(
        v8::String::NewFromUtf8Literal(isolate, "socket() failed")));
    return;
  }

  if (connect(fd, result->ai_addr, result->ai_addrlen) < 0) {
    close(fd);
    freeaddrinfo(result);
    isolate->ThrowException(v8::Exception::Error(
        v8::String::NewFromUtf8Literal(isolate, "connect() failed")));
    return;
  }
  freeaddrinfo(result);

  int flag = 1;
  setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &flag, sizeof(flag));

  fprintf(stdout, "endo-init: Connected to %s:%d\n", *host, port);
  info.GetReturnValue().Set(MakeConnection(isolate, fd));
}

// net.help()
static void NetHelp(const v8::FunctionCallbackInfo<v8::Value>& info) {
  info.GetReturnValue().Set(v8::String::NewFromUtf8Literal(
      info.GetIsolate(),
      "NetworkInterface capability: listen(port), connect(host, port)"));
}

// __createNetworkInterface() → NetworkInterface capability
static void CreateNetworkInterface(
    const v8::FunctionCallbackInfo<v8::Value>& info) {
  v8::Isolate* isolate = info.GetIsolate();
  v8::HandleScope handle_scope(isolate);

  v8::Local<v8::ObjectTemplate> tmpl = v8::ObjectTemplate::New(isolate);

  auto Set = [&](const char* name, v8::FunctionCallback cb) {
    tmpl->Set(v8::String::NewFromUtf8(isolate, name,
                                      v8::NewStringType::kNormal)
                  .ToLocalChecked(),
              v8::FunctionTemplate::New(isolate, cb));
  };

  Set("listen", NetListen);
  Set("connect", NetConnect);
  Set("help", NetHelp);

  v8::Local<v8::Object> obj =
      tmpl->NewInstance(isolate->GetCurrentContext()).ToLocalChecked();

  fprintf(stdout, "endo-init: Network interface created\n");
  info.GetReturnValue().Set(obj);
}

void InstallNetwork(v8::Isolate* isolate,
                    v8::Local<v8::ObjectTemplate> global) {
  global->Set(
      v8::String::NewFromUtf8Literal(isolate, "__createNetworkInterface"),
      v8::FunctionTemplate::New(isolate, CreateNetworkInterface));
}

}  // namespace devices
}  // namespace endo
