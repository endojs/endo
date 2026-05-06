// Minimal Cap'n Proto C++ server exposing the `Echo` interface from
// `echo.capnp` over TCP. Used as the peer for the live RPC interop test
// (test/interop-rpc.test.js). Modeled after the upstream calculator-server
// example.
//
// Build:
//   capnp compile -oc++ echo.capnp
//   g++ -std=c++17 -O2 -I. echo-server.c++ echo.capnp.c++ \
//       $(pkg-config --cflags --libs capnp-rpc) -o echo-server
//
// Run:
//   ./echo-server 127.0.0.1:0
//
// Prints `listening on port N\n` to stdout once accepting (with explicit
// flush so the spawning test can read it without buffering games), then
// runs the kj event loop until killed.

#include <capnp/ez-rpc.h>
#include <kj/async.h>
#include <kj/string.h>
#include "echo.capnp.h"
#include <iostream>

class EchoImpl final : public Echo::Server {
public:
  kj::Promise<void> ping(PingContext context) override {
    auto msg = context.getParams().getMsg();
    context.getResults().setReply(kj::str("pong: ", msg));
    return kj::READY_NOW;
  }

  kj::Promise<void> count(CountContext context) override {
    uint32_t n = context.getParams().getN();
    context.getResults().setTwiceN(n * 2);
    return kj::READY_NOW;
  }
};

int main(int argc, char* argv[]) {
  if (argc != 2) {
    std::cerr << "usage: " << argv[0] << " HOST:PORT" << std::endl;
    return 1;
  }

  capnp::EzRpcServer server(kj::heap<EchoImpl>(), argv[1]);
  auto& waitScope = server.getWaitScope();
  uint port = server.getPort().wait(waitScope);
  std::cout << "listening on port " << port << std::endl;
  std::cout.flush();

  kj::NEVER_DONE.wait(waitScope);
  return 0;
}
