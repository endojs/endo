// Cap'n Proto C++ server exposing the TestSuite interface defined in
// echo.capnp. Used as the peer for the live RPC interop tests in:
//   - test/interop-rpc.test.js          (basic Node→C++ TestSuite round-trip)
//   - test/interop-rpc-multi.test.js    (two-client + cap-passing scenarios)
//
// Modeled after the upstream calculator-server example. Each newCounter()
// call mints a fresh CounterImpl, and the server stays up until SIGTERM.
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

class CounterImpl final : public Counter::Server {
public:
  kj::Promise<void> inc(IncContext context) override {
    value += 1;
    context.getResults().setValue(value);
    return kj::READY_NOW;
  }

  kj::Promise<void> get(GetContext context) override {
    context.getResults().setValue(value);
    return kj::READY_NOW;
  }

private:
  uint32_t value = 0;
};

class TestSuiteImpl final : public TestSuite::Server {
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

  kj::Promise<void> newCounter(NewCounterContext context) override {
    context.getResults().setCounter(kj::heap<CounterImpl>());
    return kj::READY_NOW;
  }

  kj::Promise<void> callBack(CallBackContext context) override {
    auto params = context.getParams();
    auto target = params.getTarget();
    auto msg = params.getMsg();

    auto request = target.pingRequest();
    request.setMsg(msg);
    return request.send().then(
        [KJ_CPCAP(context)](auto response) mutable {
          context.getResults().setReply(response.getReply());
        });
  }
};

int main(int argc, char* argv[]) {
  if (argc != 2) {
    std::cerr << "usage: " << argv[0] << " HOST:PORT" << std::endl;
    return 1;
  }

  capnp::EzRpcServer server(kj::heap<TestSuiteImpl>(), argv[1]);
  auto& waitScope = server.getWaitScope();
  uint port = server.getPort().wait(waitScope);
  std::cout << "listening on port " << port << std::endl;
  std::cout.flush();

  kj::NEVER_DONE.wait(waitScope);
  return 0;
}
